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

  // auditEngine.js's consolidateInquiries() merges the same creditor+date
  // seen on multiple bureaus into ONE inquiry object carrying a `bureaus`
  // ARRAY (e.g. ["EX","TU","EQ"]) — `.bureau` (singular) is left over from
  // whichever bureau's raw record happened to be processed first and does
  // NOT mean "this is the only bureau it's on". Bucketing off `.bureau`
  // here silently dropped every inquiry from its OTHER bureaus' thread
  // arrays — for a typical inquiry that hits all 3 bureaus, 2 of the 3
  // would vanish from thread.json entirely. Matches the bureaus-array
  // pattern reportAutoImport.js#runIdiqImport and ParseRreportModal.jsx
  // already use correctly for the same data.
  const hasBureau = (item, code) =>
    Array.isArray(item.bureaus) ? item.bureaus.includes(code) : item.bureau === code;

  inquiries.forEach((inq) => {
    const item = { date: inq.date, creditor: inq.creditor };
    if (hasBureau(inq, "EX")) thread.experian.push(item);
    if (hasBureau(inq, "TU")) thread.transunion.push(item);
    if (hasBureau(inq, "EQ")) thread.equifax.push(item);
  });

  return thread;
}
