// src/utils/buildThreadFromAudit.js
//
// Turns an already-computed runAuditEngine() result into the
// {accounts, experian, transunion, equifax} shape thread.json is stored
// in — the same shape the fetch_3b_report edge function independently
// re-derived by logging into SmartCredit a second time and re-parsing the
// bundle from scratch. useClientCreditFiles.js already had this exact
// derivation inline as a fallback for when thread.json is missing; this is
// that same logic promoted to a shared helper so Fetch3bModal.jsx and
// reportAutoImport.js can build a thread payload locally (from the raw
// report + auditEngine.js's parse they already have in hand) instead of
// making a second network round-trip that re-fetches and re-parses the
// identical report.
//
// Not a replacement for classifyInquiries — callers still run that
// separately on the accounts/inquiries this returns.

export function buildThreadFromAudit(auditResult) {
  const thread = { accounts: [], experian: [], transunion: [], equifax: [] };
  if (!auditResult) return thread;

  const accounts = Array.isArray(auditResult.accounts) ? auditResult.accounts : [];
  const inquiries = Array.isArray(auditResult.inquiries) ? auditResult.inquiries : [];

  thread.accounts = accounts.map((acc) => ({
    creditor: acc.name,
    type: acc.type,
    dateOpened: acc.opened,
    openClosed: acc.status,
  }));

  inquiries.forEach((inq) => {
    const item = { date: inq.date, creditor: inq.creditor };
    if (inq.bureau === "EX") thread.experian.push(item);
    if (inq.bureau === "TU") thread.transunion.push(item);
    if (inq.bureau === "EQ") thread.equifax.push(item);
  });

  return thread;
}
