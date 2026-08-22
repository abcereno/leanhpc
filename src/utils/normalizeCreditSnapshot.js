// src/utils/normalizeCreditSnapshot.js
//
// Two different parsers write client_audit_report.json /
// *_summary_report.json snapshots depending on which flow ran:
//   - the credit_analysis edge function (the live SmartCredit
//     import/update path, via Fetch3bModal.jsx / ClientHeader.jsx) —
//     scores as {score,date,model,factors} objects, accounts with
//     creditor/accountNumberLast4/late30-60-90/openClosed, top-level
//     .utilization/.counts, no .summary at all.
//   - runAuditEngine (utils/auditEngine.js — the IDIQ / RawReportDebugger.jsx
//     path) — scores as plain numbers, accounts with name/account_num/tags
//     (no numeric late counts, no creditor/accountNumberLast4 fields),
//     .summary.utilization_pct/total_debt/total_revolving_limit.
//
// utils/creditAnalysis.js's compareSnapshots/detectProfileChanges were
// written reading a mix of field names that don't fully match EITHER real
// shape (e.g. .summary.utilization instead of either shape's actual
// .summary.utilization_pct or .utilization.usagePct, .publicRecords
// instead of both shapes' actual .public_records) — so several checks
// silently never fired regardless of which parser produced the snapshot.
//
// This is the single place that translates either shape (or a mix of the
// two, since a client's snapshot history can span both if they've been
// through different import flows over time) into one canonical shape.
// Every current and future consumer of a stored snapshot — comparison,
// delta/notification detection, the Progress Report's score display,
// anything added later — should read through this instead of the raw
// file, so it never matters which parser produced a given snapshot.

/** Score value can be a plain number, a numeric string, or an object like
 * {score, riskScore, Score} depending on source. Always returns a number. */
export function normalizeScoreValue(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseInt(v, 10) || 0;
  if (typeof v === "object") {
    return parseInt(v.score ?? v.riskScore ?? v.Score, 10) || 0;
  }
  return 0;
}

function last4(v) {
  return String(v || "").replace(/\D/g, "").slice(-4);
}

/** Canonical account shape: { creditor, accountNumberLast4, openClosed,
 * late30, late60, late90, balance, limit, status, type, bureau }. */
function normalizeAccount(a) {
  const creditor = a.creditor || a.name || a.account || a.account_name || "";
  const accountNumberLast4 =
    a.accountNumberLast4 || last4(a.account_num || a.account_number);
  const openClosed = a.openClosed || a.account_status || "";

  // auditEngine.js doesn't carry numeric late-payment counts — only a
  // .tags array with 'Late-30' / 'Late-60' / 'Late-90' / 'Late-120+'
  // strings. Derive counts from those so late-payment detection works
  // for this shape too, instead of only ever seeing credit_analysis's
  // native late30/late60/late90 fields.
  let late30 = a.late30 || 0;
  let late60 = a.late60 || 0;
  let late90 = a.late90 || 0;
  if (!late30 && !late60 && !late90 && Array.isArray(a.tags)) {
    if (a.tags.includes("Late-30")) late30 = 1;
    if (a.tags.includes("Late-60")) late60 = 1;
    if (a.tags.includes("Late-90") || a.tags.includes("Late-120+")) late90 = 1;
  }

  return {
    creditor,
    accountNumberLast4,
    openClosed,
    late30,
    late60,
    late90,
    balance: a.currentBalance ?? a.balance ?? 0,
    limit: a.creditLimit ?? a.limit ?? 0,
    status: a.status || a.payment_status || "",
    type: a.type || a.specificAccountType || "",
    bureau: a.bureau || "",
  };
}

/** Canonical negative shape: { account, accountNumberLast4, bureau, issue }.
 * credit_analysis's negatives carry no account-number field at all (only
 * .account/.issue/.notes) — borrowed from the matching normalized account
 * (same source report, same creditor + bureau) so negative-matching stays
 * account-number-precise instead of silently degrading to name-only
 * matching for that shape (the exact "false new/deleted" bug
 * compareSnapshots' account-number matching was built to avoid). */
function normalizeNegative(n, normalizedAccounts) {
  const account = n.account || n.name || "Unknown";
  let accountNumberLast4 =
    n.accountNumberLast4 || last4(n.account_num || n.account_number);

  if (!accountNumberLast4 && normalizedAccounts?.length) {
    const upperAccount = String(account).toUpperCase();
    const match = normalizedAccounts.find(
      (a) =>
        a.creditor &&
        a.creditor.toUpperCase() === upperAccount &&
        (!n.bureau || !a.bureau || a.bureau === n.bureau),
    );
    if (match) accountNumberLast4 = match.accountNumberLast4;
  }

  return {
    ...n,
    account,
    accountNumberLast4,
    bureau: n.bureau || "",
    issue: n.issue || n.detail || n.reason || "",
  };
}

/** Canonical snapshot shape:
 * { scores: {EX,TU,EQ}, summary: {utilization,totalBalance,totalLimit},
 *   accounts: [...], inquiries: [...], negatives: [...],
 *   publicRecords: [...], fraudAlerts: [...] } */
export function normalizeCreditSnapshot(report) {
  if (!report) return null;

  const scores = {
    EX: normalizeScoreValue(report.scores?.EX),
    TU: normalizeScoreValue(report.scores?.TU),
    EQ: normalizeScoreValue(report.scores?.EQ),
  };

  const accounts = (report.accounts || []).map(normalizeAccount);
  const negatives = (report.negatives || []).map((n) =>
    normalizeNegative(n, accounts),
  );

  // auditEngine's summary lives at .summary.{utilization_pct,total_debt,
  // total_revolving_limit}; credit_analysis has no .summary at all —
  // the same numbers live at top-level .utilization.{usagePct,totalBal,
  // totalLimit} instead.
  const summary = report.summary
    ? {
        utilization: report.summary.utilization_pct ?? 0,
        totalBalance: report.summary.total_debt ?? 0,
        totalLimit: report.summary.total_revolving_limit ?? 0,
      }
    : {
        utilization: report.utilization?.usagePct ?? 0,
        totalBalance: report.utilization?.totalBal ?? 0,
        totalLimit: report.utilization?.totalLimit ?? 0,
      };

  return {
    scores,
    summary,
    accounts,
    inquiries: report.inquiries || [],
    negatives,
    // Both real shapes actually name this field public_records
    // (snake_case) — publicRecords was checked nowhere it actually exists.
    publicRecords: report.public_records || report.publicRecords || [],
    fraudAlerts: report.fraudAlerts || report.fraud_alerts || [],
  };
}
