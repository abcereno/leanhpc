// utils/creditAnalysisStorage.js
import { supabase } from "../supabaseClient";

// ---- where we stored it ----
export const BUCKET = "clients";
export const PATH = (clientId) => `${clientId}/credit_analysis.json`;

// ---- download & parse (robust) ----
export async function loadCreditAnalysis(clientId) {
  if (!clientId) throw new Error("credit_analysis.json download failed: missing clientId");

  const { data, error } = await supabase.storage.from(BUCKET).download(PATH(clientId));

  if (error) {
    const msg = error?.message || "unknown error";
    throw new Error(`credit_analysis.json download failed: ${msg}`);
  }

  let jsonText = "";
  try {
    jsonText = await data.text();
  } catch (e) {
    // Error constructor takes only message+options; pass original error via cause
    throw new Error("credit_analysis.json read failed: unable to read file", { cause: e });
  }

  try {
    const parsed = JSON.parse(jsonText);
    // If the file saved as { data: {...} }, unwrap it transparently
    return parsed?.data ?? parsed;
  } catch (e) {
    throw new Error("credit_analysis.json parse failed: invalid JSON", { cause: e });
  }
}

/**
 * Normalize whatever your edge function returned into the shape your UI expects.
 * Supports:
 *   (A) { pdfData, calls?, docs? }
 *   (B) pdfData directly
 * Always returns: { pdfData, calls, docs }
 */
export function toAuditPayload(analysis, extra = {}) {
  const src = analysis || {};

  // Prefer the edge function’s own pdf-like payload if present
  const pdfData =
    src?.pdfData ||
    src?.parsed ||
    src?.report ||
    src?.data ||
    {};

  // ---------- client merge (enrich from clients table when provided) ----------
  const extraClient = extra.client || {};
  const existingClient = pdfData.client || {};
  pdfData.client = {
    ...existingClient,
    full_name:
      existingClient.full_name ??
      extra.clientName ??
      extraClient.full_name ??
      "",
    address:   extraClient.address   ?? existingClient.address   ?? "",
    email:     extraClient.email     ?? existingClient.email     ?? "",
    phone:     extraClient.phone     ?? existingClient.phone     ?? "",
    ssn_last4: extraClient.ssn_last4 ?? existingClient.ssn_last4 ?? "",
    dob:       extraClient.dob       ?? existingClient.dob       ?? "",
  };

  // ---------- monitoring ----------
  pdfData.monitoring = {
    provider: src?.provider || pdfData.monitoring?.provider || "SmartCredit",
    as_of:    src?.as_of || src?.report_date || pdfData.monitoring?.as_of || "",
  };

  // ---------- scores (support EX/TU/EQ objects or simple numbers) ----------
  const s = src?.scores || pdfData.scores || {};
  const readScore = (k) => {
    const v = s?.[k];
    if (v == null) return null;
    if (typeof v === "number") return v;
    if (typeof v?.score === "number") return v.score;
    // sometimes nested like { Results: { Score } }
    if (typeof v?.Results?.Score === "number") return v.Results.Score;
    return numOrNull(v);
  };
  const exp = numOrNull(s?.exp) ?? readScore("EX");
  const tu  = numOrNull(s?.tu)  ?? readScore("TU");
  const eq  = numOrNull(s?.eq)  ?? readScore("EQ");

  // If avg not provided, compute from available scores
  const avgFrom = [exp, tu, eq].filter((n) => typeof n === "number");
  const avgCalc = avgFrom.length ? Math.round(avgFrom.reduce((a, b) => a + b, 0) / avgFrom.length) : null;

  pdfData.scores = {
    exp,
    tu,
    eq,
    avg: numOrNull(s?.avg) ?? avgCalc,
  };

  // ---------- utilization ----------
  const utilSrc = src?.util || src?.utilization || src?.revolving || {};
  pdfData.util = {
    total_limit: coalesceNum(
      pdfData.util?.total_limit,
      utilSrc?.total_limit,
      utilSrc?.totalLimit,
      0
    ),
    current_balance: coalesceNum(
      pdfData.util?.current_balance,
      utilSrc?.current_balance,
      utilSrc?.totalBal,
      utilSrc?.currentBalance,
      0
    ),
    usage_pct: coalesceNum(
      pdfData.util?.usage_pct,
      utilSrc?.usage_pct,
      utilSrc?.usagePct,
      utilSrc?.utilization_pct,
      0
    ),
  };

  // ---------- summary (prefer authoritative counts from edge: src.counts) ----------
  const c = src?.counts || src?.summary || {};
  pdfData.summary = {
    accounts:      coalesceNum(pdfData.summary?.accounts,      c?.accounts,        c?.accounts_total,      src?.accounts_count),
    open:          coalesceNum(pdfData.summary?.open,          c?.open,            c?.open_accounts),
    closed:        coalesceNum(pdfData.summary?.closed,        c?.closed,          c?.closed_accounts),
    collections:   coalesceNum(pdfData.summary?.collections,   c?.collections,     src?.collections_count),
    public_records:coalesceNum(pdfData.summary?.public_records,c?.public_records,  c?.public_records_total, 0),
    inquiries:     coalesceNum(pdfData.summary?.inquiries,     c?.inquiries,       c?.inquiries_total,      src?.inquiries_count),
  };

  // ---------- arrays ----------
  pdfData.negatives  = arrayOrEmpty(pdfData.negatives ?? src?.negatives);
  pdfData.plan       = arrayOrEmpty(pdfData.plan      ?? src?.plan);
  pdfData.next_steps = arrayOrEmpty(pdfData.next_steps?? src?.next_steps);

  // Always return top-level calls/docs (empty arrays if none)
  return {
    pdfData,
    calls: arrayOrEmpty(extra.calls ?? src?.calls),
    docs:  arrayOrEmpty(extra.docs  ?? src?.docs),
  };
}

// ---------- small helpers ----------
function coalesceNum(...vals) {
  for (const v of vals) {
    if (v === 0) return 0;
    if (v != null && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}
function numOrNull(v) {
  if (v === 0) return 0;
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function arrayOrEmpty(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  // coerce singletons
  return [v];
}
