// src/utils/reportAutoImport.js
//
// Shared "pull a credit report and drop it in as this client's thread.json"
// logic used by every add-client entry point that offers an auto-fetch on
// intake: AddClientForm.jsx (public/company /add-clients page) and
// AddClientModal.jsx (company portal's "Add Client" modal). Both used to
// carry their own copy-pasted version of this exact logic (SmartCredit-only,
// generateId and all) — kept here once now so adding a second provider
// (IDIQ) or fixing a bug only has to happen in one place. Progress/
// completion status itself is computed via utils/inquiryCounts.js#computeBureauProgress
// (shared with every other save path) rather than a further local copy.
//
// Two providers, one shared shape:
//   - SmartCredit: fetch_3b_raw + credit_analysis + fetch_3b_report Supabase
//     edge functions.
//   - IDIQ: backend-4uir.onrender.com/loginidiq — the same external pull
//     ParseRreportModal.jsx (admin/company/individual "fetch report" flow)
//     uses, requiring email/password plus optional pin/ssn. NOTE: there is a
//     second, older IDIQ endpoint (idiq-api.onrender.com/loginidiq, used by
//     SmartIdiQModal.jsx's admin quick-add) that only takes email/password —
//     that one is intentionally NOT used here since it can't authenticate
//     accounts that require a PIN/SSN, which ParseRreportModal.jsx's version
//     handles. The raw report from backend-4uir is run through
//     utils/auditEngine.js#runAuditEngine (same as ParseRreportModal.jsx) to
//     get consolidated inquiries/accounts before bucketing by bureau.
// Both are intentionally left un-classified ("non-linked" default) here —
// SmartIdiQModal.jsx additionally runs an AI classify-inquiries step for its
// quick-add flow, but that's skipped on these intake forms on purpose so
// both providers behave identically and a human reviews classifications in
// the thread editor afterward either way.
//
// Neither path touches clients.approved_*_count / count_review_requests —
// intake creates the client at "nothing classified yet", so there's nothing
// yet worth a supervisor's count review (see utils/countReviewSync.js for
// when that kicks in: the first real classification save).

import { supabase } from "../supabaseClient";
import { runAuditEngine } from "./auditEngine";
import { computeBureauProgress } from "./inquiryCounts";
import { saveInitialAudit } from "./reportStorage";
import { buildThreadFromAudit } from "./buildThreadFromAudit";

const generateId = () => Math.random().toString(36).substr(2, 9);

const addId = (item) => ({
  ...item,
  id: item.id || generateId(),
  classification: item.classification || "non-linked",
});

/** Uploads thread.json + updates the clients row's per-bureau completion
 * flags — the tail end both providers share once they've each fetched their
 * own raw { accounts, experian, transunion, equifax } shape. */
async function saveThreadAndFlags(clientId, { accounts, experian, transunion, equifax }, counterName) {
  const threadPayload = {
    accounts: (accounts || []).map(addId),
    experian: (experian || []).map(addId),
    transunion: (transunion || []).map(addId),
    equifax: (equifax || []).map(addId),
  };

  // Shared with every other save path (utils/inquiryCounts.js) rather than
  // a local copy — the local version here previously omitted "dnd" from
  // its na/done checks, same bug that existed in Fetch3bModal.jsx. In
  // practice everything arrives "non-linked" on this intake flow (see file
  // header), so this mostly still yields progress 0 — except the genuine
  // edge case of a client with zero inquiries in any bureau, which now
  // correctly reads as fully done/N-A instead of a hardcoded 0%.
  const newProgress = computeBureauProgress(threadPayload);

  const threadBlob = new Blob([JSON.stringify(threadPayload, null, 2)], { type: "application/json" });
  const { error: uploadErr } = await supabase.storage
    .from("clients")
    .upload(`${clientId}/thread.json`, threadBlob, { upsert: true, contentType: "application/json" });
  if (uploadErr) throw uploadErr;

  await supabase
    .from("clients")
    .update({
      exp_completed: newProgress.exp_completed,
      tu_completed: newProgress.tu_completed,
      eq_completed: newProgress.eq_completed,
      exp_na: newProgress.exp_na,
      tu_na: newProgress.tu_na,
      eq_na: newProgress.eq_na,
      progress: newProgress.progress,
      counter: counterName || "System",
    })
    .eq("id", clientId);

  return threadPayload;
}

/** SmartCredit auto-fetch — pulls the raw report, a credit analysis, and the
 * 3B thread, uploading all three to storage, then flags per-bureau status.
 * Throws on any failed step; callers are responsible for catching and
 * surfacing a "client saved, but import failed" warning (the client record
 * itself is always already saved by the time this is called). */
export async function runSmartCreditImport(clientId, { email, password }, counterName) {
  const creds = { email: email.trim(), password: password.trim() };

  // Single login: fetch_3b_raw is the only step that actually authenticates
  // with SmartCredit. credit_analysis and fetch_3b_report both used to log
  // in separately to re-fetch the identical report — three logins for one
  // import, tripling exposure to SmartCredit's Cloudflare bot-challenge.
  // Both edge functions now accept the already-fetched raw report via
  // `rawReport` and skip their own login when it's present (see their
  // 2026-08-20 header notes), falling back to `creds` only if this fetch
  // failed and rawData stayed null.
  const rawRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch_3b_raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify(creds),
  });
  if (!rawRes.ok) {
    throw new Error("Invalid credentials or verification failed. Report provider blocked the login.");
  }
  let rawData = null;
  const contentType = rawRes.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await rawRes.json();
    rawData = json.report || json;
  }

  const analRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/credit_analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
    body: JSON.stringify(rawData ? { rawReport: rawData, months: 24 } : { ...creds, months: 24 }),
  });
  const analysis = await analRes.json();
  if (analRes.ok && analysis) {
    const analysisBlob = new Blob([JSON.stringify(analysis, null, 2)], { type: "application/json" });
    await supabase.storage.from("clients").upload(`${clientId}/credit_analysis.json`, analysisBlob, { upsert: true, contentType: "application/json" });
    const parsed = analysis.pdfData || analysis.parsed || analysis.report || analysis.data || null;
    const parsedBlob = new Blob([JSON.stringify(parsed ?? {}, null, 2)], { type: "application/json" });
    await supabase.storage.from("clients").upload(`${clientId}/credit_analysis.parsed.json`, parsedBlob, { upsert: true, contentType: "application/json" });
  }

  // Day-0 baseline: writes raw_credit_report.json (the canonical "current
  // report" file), client_audit_report.json, today's progress snapshot,
  // and the first score-history entry — see utils/reportStorage.js. Without
  // this, a brand-new client needed a second report update before Progress
  // Report had two snapshots to compare against. Non-fatal: thread.json
  // and the client's progress flags (saveThreadAndFlags below) are what
  // actually make intake succeed, so a failure here shouldn't block it.
  if (rawData) {
    try {
      await saveInitialAudit(clientId, rawData, analysis);
    } catch (auditErr) {
      console.warn("Could not save initial audit snapshot:", auditErr);
    }
  }

  // Thread payload used to come from a THIRD separate SmartCredit login via
  // fetch_3b_report — redundant now that rawData is already in hand and can
  // be parsed locally with the same auditEngine.js every other display
  // surface uses. See utils/buildThreadFromAudit.js.
  if (!rawData) throw new Error("Could not retrieve raw report. Please try again.");
  const auditResult = runAuditEngine(rawData);
  const threadData = buildThreadFromAudit(auditResult);

  return saveThreadAndFlags(clientId, threadData, counterName);
}

/** IDIQ auto-fetch — same external pull ParseRreportModal.jsx uses
 * (backend-4uir.onrender.com/loginidiq) with optional pin/ssn support, run
 * through the shared audit engine, then bucketed by bureau. Intentionally
 * skips SmartIdiQModal.jsx's AI classify-inquiries step (see file header) so
 * both providers on these intake forms behave the same way: everything
 * comes in "non-linked" for a human to classify in the thread editor. */
export async function runIdiqImport(clientId, { email, password, pin, ssn }, counterName) {
  const res = await fetch("https://backend-4uir.onrender.com/loginidiq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim(),
      password: password.trim(),
      pin: (pin || "").trim(),
      ssn: (ssn || "").trim(),
    }),
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(`IDIQ service returned an unexpected response (${res.status}): ${text.slice(0, 100)}`);
  }

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || "Invalid credentials or verification failed. IDIQ blocked the login.");
  }

  const reportData = json.report;
  if (!reportData) throw new Error("No report data returned from IDIQ service.");

  const auditSummary = runAuditEngine(reportData);
  if (!auditSummary) throw new Error("Failed to analyze IDIQ report data.");

  const inquiries = auditSummary.inquiries || [];
  const accounts = auditSummary.accounts || [];
  const hasBureau = (item, bCode) => Array.isArray(item.bureaus) && item.bureaus.includes(bCode);

  return saveThreadAndFlags(clientId, {
    accounts,
    experian: inquiries.filter((i) => hasBureau(i, "EX")),
    transunion: inquiries.filter((i) => hasBureau(i, "TU")),
    equifax: inquiries.filter((i) => hasBureau(i, "EQ")),
  }, counterName);
}

/** Single entry point both forms call so callers don't need their own
 * if/else on provider — `provider` is "smartcredit" | "idiq". `creds` is
 * `{ email, password }` for SmartCredit, or `{ email, password, pin, ssn }`
 * for IDIQ (pin/ssn are optional — only some IDIQ accounts require them). */
export async function runReportAutoImport(provider, clientId, creds, counterName) {
  if (provider === "idiq") return runIdiqImport(clientId, creds, counterName);
  return runSmartCreditImport(clientId, creds, counterName);
}
