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

// Helper: Normalize Bureau
export function bureauKey(s) {
  const x = (s || "").toLowerCase();
  if (x.includes("experian") || x === "ex") return "EX";
  if (x.includes("transunion") || x === "tu") return "TU";
  if (x.includes("equifax") || x === "eq") return "EQ";
  return "";
}

// Helper: Identify Negatives — used by detectProfileChanges() below to spot
// new collections/charge-offs between two audit snapshots.
function isCollection(a) {
  const t = (a.type || a.specificAccountType || "").toLowerCase();
  const s = (a.status || a.accountCondition || "").toLowerCase();
  return t.includes("coll") || s.includes("collection") || s.includes("charge off") || s.includes("charge-off") || s.includes("profit and loss");
}

function isChargeOff(a) {
  const s = (a.status || a.accountCondition || "").toLowerCase();
  return s.includes("charge off") || s.includes("charge-off") || s.includes("profit and loss");
}

// --- DELTA ANALYSIS ENGINE (Triggers the 14 Emails) ---
export function detectProfileChanges(oldReport, newReport) {
    if (!oldReport || !newReport) return [];
    
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

    // 8. Account Closure Detected
    const oldOpen = oldReport.accounts.filter(a => (a.openClosed || "").toLowerCase().includes("open"));
    for (const oldAcct of oldOpen) {
        const matchedNew = newReport.accounts.find(a => a.creditor === oldAcct.creditor && a.accountNumberLast4 === oldAcct.accountNumberLast4);
        if (matchedNew && (matchedNew.openClosed || "").toLowerCase().includes("closed")) {
            events.add("account_closure");
            break;
        }
    }

    // 9. Balance Increase Detected
    if (newReport.summary.total_balance > oldReport.summary.total_balance) events.add("balance_increase");

    // 10. Fraud Alert Detected
    if ((newReport.fraudAlerts?.length || 0) > (oldReport.fraudAlerts?.length || 0)) events.add("fraud_alert");

    // 11. Credit Limit Decrease Detected (Only if total limits dropped, ignores closures)
    if (newReport.summary.total_limit < oldReport.summary.total_limit && newReport.summary.total_limit > 0) events.add("limit_decrease");

    // 12. High Utilization Warning Detected
    if (newReport.summary.utilization > 30 && oldReport.summary.utilization <= 30) events.add("high_utilization_warning");

    // 13. Bankruptcy Activity Detected
    if ((newReport.publicRecords?.length || 0) > (oldReport.publicRecords?.length || 0)) events.add("new_bankruptcy");

    // 14. Previously Removed Account Reappeared (Reinsertion)
    const addedItems = compareSnapshots(oldReport, newReport);
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
function normalizeName(name) {
  return name?.toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 10) || "";
}

function matchKey(item, getName) {
  const name = normalizeName(getName(item));
  // `accountNumberLast4` was the old analyzeRawReport() parser's field name;
  // `account_num` is runAuditEngine's (the one actually used by every real
  // snapshot) — checking both means this works regardless of which parser
  // produced the file being compared. Only the last 4 digits are used
  // either way, since account_num can be a longer/partially-masked string.
  const rawAcct = item.accountNumberLast4 || item.account_num || item.account_number || "";
  const last4 = String(rawAcct).replace(/[^0-9]/g, "").slice(-4);
  if (!name && !last4) return null; // never match two unidentifiable items to each other
  return last4 ? `${name}#${last4}` : name;
}

export function compareSnapshots(startReport, currentReport) {
  const bureaus = ["EX", "TU", "EQ"];
  const comparison = {
    EX: { deleted: [], remaining: [], added: [] },
    TU: { deleted: [], remaining: [], added: [] },
    EQ: { deleted: [], remaining: [], added: [] }
  };

  const getName = (item) => item.name || item.account || "Unknown";

  bureaus.forEach(bureau => {
    const startItems = (startReport.negatives || []).filter(n => bureauKey(n.bureau) === bureau);
    const currentItems = (currentReport.negatives || []).filter(n => bureauKey(n.bureau) === bureau);

    startItems.forEach(item => {
      const key = matchKey(item, getName);
      const stillExists = key && currentItems.find(curr => matchKey(curr, getName) === key);
      if (!stillExists) comparison[bureau].deleted.push({ ...item, account: getName(item) });
      else comparison[bureau].remaining.push({ ...item, account: getName(item) });
    });

    currentItems.forEach(item => {
      const key = matchKey(item, getName);
      const existedBefore = key && startItems.find(start => matchKey(start, getName) === key);
      if (!existedBefore) comparison[bureau].added.push({ ...item, account: getName(item) });
    });
  });

  return comparison;
}