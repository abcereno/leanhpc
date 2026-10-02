// src/utils/inquiryCountRules.js
//
// Deterministic "HPC Inquiry Count Rules" engine — replaces the GPT-4-turbo
// classify-inquiries Edge Function for the on-demand re-count action in
// InquiriesThread.jsx (see AskUserQuestion decision: "Replace the AI
// classifier entirely"). Ported from the rules table + 4 validated test
// cases in the public "HPC Inquiry Count Rules" artifact
// (claude.ai/artifact/8cLzN1zZwSHVqD3J8JS1ci) — the artifact's own JS
// engine source was never made available, so this is a from-spec
// reimplementation. The name-matching plumbing (lender_aliases table,
// canonical/alias resolution, dealership <-> captive-finance-company
// relationship via related_canonical_name) is reused as-is from
// supabase/functions/classify-inquiries/index.ts so "same company" means
// the same thing here that it already does everywhere else in the app —
// see fetchLenderAliases() in classifyInquiries.js for where the table
// comes from.
//
// Rules (bureau-scoped inquiries vs. the client's full account list,
// since accounts aren't themselves bureau-tagged in this data model):
//   1A  Same company as an OPEN account, inquiry date == account's opening
//       date                                              -> Linked
//   1B  Same company as an OPEN account, inquiry within 6 months (180
//       days) BEFORE the opening date                     -> Linked
//   RP  (Re-pull) Same company, account opened 1-3 days AFTER the inquiry
//                                                           -> Linked
//   DL  (Dealer) Same day as another inquiry that was Linked (1A/1B/RP) to
//       an open account, and this inquiry's creditor is a dealer whose
//       related finance company is that account's company (e.g. an
//       Infiniti dealer inquiry linked via a Nissan-Infiniti lease)
//                                                           -> Linked
//   CX  (Closed Account Exception) Same company AND same date as a CLOSED
//       account                                   -> "Dispute Requested"
//   2A  Everything else (including >3 days after an opening with no other
//       match)                                             -> Disputable
//
// The 6-month lookback (1B) only ever applies to OPEN accounts. Output
// classification values match the ones already used throughout the app
// (InquiriesThread.jsx's classification <select>): "linked", "non-linked",
// "dispute". A `countRule` field (1A/1B/RP/DL/CX/2A) is stamped onto each
// returned inquiry purely for traceability/debugging in the UI and logs —
// no existing code reads it, so it's additive and safe.

const DAY_MS = 86400000;

function normalizeAliasKey(s) {
  return String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
}

function buildAliasMap(lenderAliases) {
  const map = new Map();
  for (const row of Array.isArray(lenderAliases) ? lenderAliases : []) {
    const key = normalizeAliasKey(row?.alias);
    if (key) map.set(key, row);
  }
  return map;
}

function resolveCanonical(name, aliasMap) {
  const key = normalizeAliasKey(name);
  if (!key || aliasMap.size === 0) return null;
  if (aliasMap.has(key)) return aliasMap.get(key);
  for (const [aliasKey, row] of aliasMap) {
    if (key.includes(aliasKey) || aliasKey.includes(key)) return row;
  }
  return null;
}

function isManualReviewIdentity(name, aliasMap) {
  return !!resolveCanonical(name, aliasMap)?.requires_manual_review;
}

function normalizeCreditorName(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(NA|N A|INC|LLC|CO|CORP|USA|BANK|BK|CARD|CREDIT|FINANCIAL|FIN|SVC|SERVICES|SERVICE)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looseNamesMatch(a, b) {
  const na = normalizeCreditorName(a);
  const nb = normalizeCreditorName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Same-company test used by 1A/1B/RP/CX. Does NOT cover the DL
// dealer<->finance-company relationship — that's a deliberately different
// (asymmetric) relationship, handled separately in applyDealerRule below.
function namesLikelyMatch(a, b, aliasMap) {
  const resolvedA = resolveCanonical(a, aliasMap);
  const resolvedB = resolveCanonical(b, aliasMap);
  if (resolvedA && resolvedB) {
    if (resolvedA.canonical_name === resolvedB.canonical_name) return true;
    return false;
  }
  return looseNamesMatch(a, b);
}

// True if `dealerName` is a known dealer alias whose related finance
// company is the same company as `lenderName` (the account/inquiry that
// already got Linked). Mirrors the BMW-of-Ontario/BMW-Financial-Services
// relationship documented in classify-inquiries/index.ts.
function isDealerOfRelatedCompany(dealerName, lenderName, aliasMap) {
  const dealer = resolveCanonical(dealerName, aliasMap);
  if (!dealer?.related_canonical_name) return false;
  const lender = resolveCanonical(lenderName, aliasMap);
  if (lender && lender.canonical_name === dealer.related_canonical_name) return true;
  // Fall back to a loose compare against the raw related_canonical_name
  // string when the lender side isn't itself in the alias table yet.
  return looseNamesMatch(lenderName, dealer.related_canonical_name);
}

function getInquiryName(item) {
  return item?.creditor || item?.name || item?.account_name || "";
}
function getInquiryDate(item) {
  return item?.date || item?.dateOpened || "";
}
function getAccountName(acct) {
  return acct?.creditor || acct?.name || acct?.account_name || "";
}
function getAccountDate(acct) {
  return acct?.dateOpened || acct?.opened || acct?.openedDate || "";
}
// Real imported accounts (buildThreadFromAudit.js: `openClosed: acc.status`,
// fed from auditEngine.js's `status: statusDesc || openClosed`) often carry
// a PAYMENT-status description here ("Current", "Pays as agreed") rather
// than a literal "Open"/"Closed" — only manually-added rows (InquiriesThread.jsx's
// handleAddAccount) reliably set openClosed to the literal string. Matching
// only on the substring "open" silently excluded almost every real account
// from 1A/1B/RP, which is what caused a prior test run to fall through to
// "everything Non-Linked." Flipped to the safer default: treat an account as
// OPEN unless its status text clearly says otherwise.
function isClosedAccount(acct) {
  const status = String(acct?.openClosed || acct?.account_status || acct?.status || "").toLowerCase();
  return /closed|charge[\s-]?off|collection|repossess|charged off/.test(status);
}
function isOpenAccount(acct) {
  return !isClosedAccount(acct);
}

// Parses "YYYY-MM-DD" and "MM/DD/YYYY" as local calendar dates (no UTC
// shift) so day-math can't drift by one depending on format — ISO
// date-only strings parse as UTC midnight via `new Date(str)`, while slash
// dates parse as local midnight, and comparing one of each could silently
// misfire 1A (exact same day) right at a bureau date boundary.
function parseLocalDate(dateStr) {
  const s = String(dateStr || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Positive = account opened AFTER the inquiry (the expected direction).
// Returns null on unparsable dates so callers fail closed (never link on
// bad data — falls through to 2A, same posture as the AI guard it's
// replacing).
function daySpread(acctDateStr, inquiryDateStr) {
  const opened = parseLocalDate(acctDateStr);
  const inquiry = parseLocalDate(inquiryDateStr);
  if (!opened || !inquiry) return null;
  return Math.round((opened.getTime() - inquiry.getTime()) / DAY_MS);
}

function sameCalendarDay(aDateStr, bDateStr) {
  const a = parseLocalDate(aDateStr);
  const b = parseLocalDate(bDateStr);
  if (!a || !b) return false;
  return a.toDateString() === b.toDateString();
}

// Classifies one inquiry against the account list, per rules 1A/1B/RP/CX/2A
// (DL is a second pass in classifyInquiriesWithRules, since it depends on
// other inquiries' results). Returns { classification, countRule }.
function classifySingleInquiry(inquiry, accounts, aliasMap) {
  const inqName = getInquiryName(inquiry);
  const inqDate = getInquiryDate(inquiry);
  const manualReview = isManualReviewIdentity(inqName, aliasMap);

  if (!manualReview) {
    // 1A / 1B / RP — same company, OPEN account.
    let best = null; // { rule, spread }
    for (const acct of accounts) {
      if (!isOpenAccount(acct)) continue;
      if (isManualReviewIdentity(getAccountName(acct), aliasMap)) continue;
      if (!namesLikelyMatch(inqName, getAccountName(acct), aliasMap)) continue;

      const spread = daySpread(getAccountDate(acct), inqDate);
      if (spread === null) continue;

      let rule = null;
      if (spread === 0) rule = "1A";
      else if (spread >= 1 && spread <= 3) rule = "RP";
      else if (spread > 3 && spread <= 180) rule = "1B";

      if (rule) {
        // Prefer the tightest-fitting rule if more than one open account
        // matches (1A beats RP beats 1B).
        const rank = { "1A": 0, RP: 1, "1B": 2 };
        if (!best || rank[rule] < rank[best.rule]) best = { rule, spread };
      }
    }
    if (best) return { classification: "linked", countRule: best.rule };

    // CX — same company AND same date as a CLOSED account.
    for (const acct of accounts) {
      if (!isClosedAccount(acct)) continue;
      if (!namesLikelyMatch(inqName, getAccountName(acct), aliasMap)) continue;
      if (sameCalendarDay(getAccountDate(acct), inqDate)) {
        return { classification: "dispute", countRule: "CX" };
      }
    }
  }

  // 2A — default/catch-all.
  return { classification: "non-linked", countRule: "2A" };
}

/**
 * Applies the HPC Inquiry Count Rules to a flat inquiries array.
 *
 * @param {Array} inquiries - flat inquiry list ({bureau, creditor, date, classification, ...})
 * @param {Array} accounts - account list ({creditor, dateOpened, openClosed, ...})
 * @param {Array} lenderAliases - rows from the lender_aliases table (see classifyInquiries.js)
 * @returns {{ inquiries: Array, summary: Object }} new inquiries array (not mutated in place)
 *   with updated `classification`/`countRule`, plus a per-rule tally for toast messaging.
 */
export function classifyInquiriesWithRules(inquiries, accounts, lenderAliases = []) {
  const aliasMap = buildAliasMap(lenderAliases);
  const list = Array.isArray(inquiries) ? inquiries : [];
  const accts = Array.isArray(accounts) ? accounts : [];

  // Pass 1: 1A/1B/RP/CX/2A, independent per inquiry.
  const firstPass = list.map((item) => {
    const { classification, countRule } = classifySingleInquiry(item, accts, aliasMap);
    return { ...item, classification, countRule, _matchedOpenAccount: null };
  });

  // Track, for each Linked-via-1A/1B/RP inquiry, which open account/company
  // it matched — needed by the DL dealer rule below.
  const linkedLenderEvents = firstPass
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.classification === "linked" && ["1A", "1B", "RP"].includes(item.countRule));

  // Pass 2: DL — same-day dealer inquiry whose related finance company
  // already got linked above.
  const result = firstPass.map((item) => {
    if (item.classification === "linked") {
      const { _matchedOpenAccount, ...clean } = item;
      return clean;
    }
    const inqName = getInquiryName(item);
    const inqDate = getInquiryDate(item);

    for (const { item: linkedItem } of linkedLenderEvents) {
      if (!sameCalendarDay(getInquiryDate(linkedItem), inqDate)) continue;
      if (isDealerOfRelatedCompany(inqName, getInquiryName(linkedItem), aliasMap)) {
        return { ...item, classification: "linked", countRule: "DL" };
      }
    }
    const { _matchedOpenAccount, ...clean } = item;
    return clean;
  });

  const summary = result.reduce((acc, item) => {
    const key = item.countRule || "2A";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return { inquiries: result, summary };
}
