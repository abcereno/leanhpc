// src/utils/creditAnalysis.js
//
// Raw-report parsing lives in src/utils/auditEngine.js (runAuditEngine) —
// the one parser every live import path (ParseRreportModal.jsx,
// ClientHeader.jsx "Update Report", RawReportDebugger.jsx) actually uses,
// and the shape src/components/shared/client-pages/CreditAuditReport.jsx
// renders. This file used to also have its own second, much lighter raw
// parser (analyzeRawReport/parseTradeline) that only
// RegenerateHistoryBtn.jsx called — it never populated personal info,
// never flattened inquiries, and dropped date/balance off negatives
// entirely, so any snapshot rebuilt through it rendered as mostly blank
// (Open Accounts/Total Debt/Utilization stuck at 0, "Detected Names: None",
// raw unparsed inquiry objects, negative rows missing Acct#/Opened/
// Balance). Removed rather than fixed in place — two parsers producing two
// different shapes for the same file is what caused the drift; RegenerateHistoryBtn.jsx
// now calls runAuditEngine() directly, same as every other import path.
//
// 2026-08-22: the functions below (detectProfileChanges, compareSnapshots)
// compare two STORED snapshots (client_audit_report.json /
// *_summary_report.json), which can come from either runAuditEngine's
// shape above OR the credit_analysis edge function's shape (the actual
// live SmartCredit import/update path — see Fetch3bModal.jsx/
// ClientHeader.jsx) depending on which flow last wrote them. Those two
// shapes disagree on almost every field name that matters here (numeric
// vs object scores, summary.utilization_pct vs top-level
// utilization.usagePct, creditor/accountNumberLast4/late30 vs
// name/account_num/tags, public_records vs the never-actually-used
// publicRecords). Both functions now normalize through
// utils/normalizeCreditSnapshot.js first so it doesn't matter which
// parser produced either snapshot being compared — see that file for the
// full field-mapping reasoning.

import { normalizeCreditSnapshot } from "./normalizeCreditSnapshot";

// Helper: Normalize Bureau
export function bureauKey(s) {
  const x = (s || "").toLowerCase();
  if (x.includes("experian") || x === "ex") return "EX";
  if (x.includes("transunion") || x === "tu") return "TU";
  if (x.includes("equifax") || x === "eq") return "EQ";
  return "";
}

// Helper: Identify Negatives — used by detectProfileChanges() below to spot
// new collections/charge-offs between two audit snapshots. Operates on
// normalized accounts (type/status field names are shared by both source
// shapes already, so no translation needed here).
function isCollection(a) {
  const t = (a.type || "").toLowerCase();
  const s = (a.status || "").toLowerCase();
  return t.includes("coll") || s.includes("collection") || s.includes("charge off") || s.includes("charge-off") || s.includes("profit and loss");
}

function isChargeOff(a) {
  const s = (a.status || "").toLowerCase();
  return s.includes("charge off") || s.includes("charge-off") || s.includes("profit and loss");
}

// --- DELTA ANALYSIS ENGINE (Triggers the 14 Emails) ---
export function detectProfileChanges(oldReportRaw, newReportRaw) {
    if (!oldReportRaw || !newReportRaw) return [];

    const oldReport = normalizeCreditSnapshot(oldReportRaw);
    const newReport = normalizeCreditSnapshot(newReportRaw);

    const events = new Set(); // Using Set to avoid duplicates

    // 1. Positive Score Movement
    if ((newReport.scores.EX > oldReport.scores.EX) ||
        (newReport.scores.TU > oldReport.scores.TU) ||
        (newReport.scores.EQ > oldReport.scores.EQ)) {
        events.add("positive_score_movement");
    }

    // 2. Late Payment Activity Detected
    const countLates = (accts) => accts.reduce((sum, a) => sum + (a.late30||0) + (a.late60||0) + (a.late90||0), 0);
    if (countLates(newReport.accounts) > countLates(oldReport.accounts)) events.add("late_payment");

    // 3. New Inquiry Detected
    if ((newReport.inquiries?.length || 0) > (oldReport.inquiries?.length || 0)) events.add("new_inquiry");

    // 4. New Account Activity Detected
    if (newReport.accounts.length > oldReport.accounts.length) events.add("new_account");

    // 5. Credit Utilization Increase Detected
    if (newReport.summary.utilization > oldReport.summary.utilization) events.add("utilization_increase");

    // 6. Collection Activity Detected
    const newCollections = newReport.accounts.filter(isCollection).length;
    const oldCollections = oldReport.accounts.filter(isCollection).length;
    if (newCollections > oldCollections) events.add("new_collection");

    // 7. Charge-Off Activity Detected
    const newCO = newReport.accounts.filter(isChargeOff).length;
    const oldCO = oldReport.accounts.filter(isChargeOff).length;
    if (newCO > oldCO) events.add("new_charge_off");

    // 8. Account Closure Detected — matched on creditor + last-4 account
    // number, both real fields on the normalized shape now (previously
    // compared fields neither source shape actually populated, so every
    // "old open account" matched the first entry in newReport.accounts
    // regardless of identity — harmless only because the following
    // .openClosed check happened to read another wrong field name too).
    const oldOpen = oldReport.accounts.filter(a => (a.openClosed || "").toLowerCase().includes("open"));
    for (const oldAcct of oldOpen) {
        if (!oldAcct.creditor && !oldAcct.accountNumberLast4) continue;
        const matchedNew = newReport.accounts.find(a =>
            a.creditor === oldAcct.creditor &&
            a.accountNumberLast4 === oldAcct.accountNumberLast4
        );
        if (matchedNew && (matchedNew.openClosed || "").toLowerCase().includes("closed")) {
            events.add("account_closure");
            break;
        }
    }

    // 9. Balance Increase Detected
    if (newReport.summary.totalBalance > oldReport.summary.totalBalance) events.add("balance_increase");

    // 10. Fraud Alert Detected
    if ((newReport.fraudAlerts?.length || 0) > (oldReport.fraudAlerts?.length || 0)) events.add("fraud_alert");

    // 11. Credit Limit Decrease Detected (Only if total limits dropped, ignores closures)
    if (newReport.summary.totalLimit < oldReport.summary.totalLimit && newReport.summary.totalLimit > 0) events.add("limit_decrease");

    // 12. High Utilization Warning Detected
    if (newReport.summary.utilization > 30 && oldReport.summary.utilization <= 30) events.add("high_utilization_warning");

    // 13. Bankruptcy Activity Detected
    if ((newReport.publicRecords?.length || 0) > (oldReport.publicRecords?.length || 0)) events.add("new_bankruptcy");

    // 14. Previously Removed Account Reappeared (Reinsertion)
    const addedItems = compareSnapshots(oldReportRaw, newReportRaw);
    const totalAdded = addedItems.EX.added.length + addedItems.TU.added.length + addedItems.EQ.added.length;
    if (totalAdded > 0) {
        // If an item was added but it has an old open date, it's likely a reinsertion
        events.add("reinserted_account");
    }

    return Array.from(events);
}

// --- SNAPSHOT COMPARISON (For Admin Dashboard) ---
//
// Matches negatives between two snapshots on creditor name + last-4 account
// number, not name alone. Name-only matching (the original implementation)
// merges genuinely different accounts from the same creditor into one
// "item" — e.g. a client with two separate JPMCB CARD collections would
// have both normalize to the same key. If only one actually got deleted,
// the surviving one masks it (falsely shows as "remaining", 0 deletions);
// if a new, unrelated collection from the same creditor shows up, it gets
// folded into the old one as "still there" instead of surfacing as
// "added". That's the exact "says something is new/deleted that isn't"
// symptom — the comparison had no way to tell two same-creditor accounts
// apart. Account number is the real identity when the bureau reports it;
// name alone is only a fallback for the (normal) case where it's masked.
//
// Both snapshots are normalized first (see utils/normalizeCreditSnapshot.js)
// — credit_analysis-shaped negatives carry no account-number field at all
// on their own, but the normalizer derives one from the matching account
// in the same report, so this stays account-number-precise regardless of
// which parser produced either snapshot.
function normalizeName(name) {
  return name?.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 10) || "";
}

function matchKey(item) {
  const name = normalizeName(item.account);
  const last4 = String(item.accountNumberLast4 || "").replace(/[^0-9]/g, "").slice(-4);
  if (!name && !last4) return null; // never match two unidentifiable items to each other
  return last4 ? `${name}#${last4}` : name;
}

export function compareSnapshots(startReportRaw, currentReportRaw) {
  const bureaus = ["EX", "TU", "EQ"];
  const comparison = {
    EX: { deleted: [], remaining: [], added: [] },
    TU: { deleted: [], remaining: [], added: [] },
    EQ: { deleted: [], remaining: [], added: [] }
  };

  const startReport = normalizeCreditSnapshot(startReportRaw) || { negatives: [] };
  const currentReport = normalizeCreditSnapshot(currentReportRaw) || { negatives: [] };

  bureaus.forEach(bureau => {
    const startItems = (startReport.negatives || []).filter(n => bureauKey(n.bureau) === bureau);
    const currentItems = (currentReport.negatives || []).filter(n => bureauKey(n.bureau) === bureau);

    startItems.forEach(item => {
      const key = matchKey(item);
      const stillExists = key && currentItems.find(curr => matchKey(curr) === key);
      if (!stillExists) comparison[bureau].deleted.push(item);
      else comparison[bureau].remaining.push(item);
    });

    currentItems.forEach(item => {
      const key = matchKey(item);
      const existedBefore = key && startItems.find(start => matchKey(start) === key);
      if (!existedBefore) comparison[bureau].added.push(item);
    });
  });

  return comparison;
}
