// src/utils/buildClassicReport.js
//
// Purpose-built formatter for recreating SmartCredit's "Classic 3B Report"
// (Personal Info / Summary / Accounts by type / Public Records / Inquiries /
// Creditor Contacts, each shown per-bureau side by side) as a client-facing
// page — see components/shared/public/ClassicReportPage.jsx.
//
// Deliberately NOT built on utils/auditEngine.js or the credit_analysis
// edge function's parser, even though both already parse this same raw
// bundle. Both exist for different jobs and both throw away exactly the
// fidelity this one needs:
//   - auditEngine.js consolidates each account into ONE row (merging what
//     each bureau reported) for dispute triage — it drops high balance,
//     verified/reported/last-activity dates, dispute status, creditor
//     type, remarks, payment history, and days-late entirely.
//   - credit_analysis keeps more per-account fields but also MERGES each
//     account across bureaus (mergeAccountsPreferTU) into one row with a
//     `primary_bureau` and a small `per_bureau` subset — not the true
//     side-by-side "here's what TU says, here's what EX says, here's what
//     EQ says" comparison the Classic Report shows, which is the point.
//
// This reads the raw SmartCredit bundle directly and keeps each bureau's
// version of every tradeline field separate, grouping tradelines that
// belong to the "same" logical account (matched by creditor name + last-4
// account number) into one row with up to three bureau columns.
//
// Field-name fallbacks below follow the same defensive multi-key pattern
// already used throughout auditEngine.js / credit_analysis's parser, since
// SmartCredit's raw JSON has historically varied which of several
// equivalent keys it populates. A few fields (Payment Frequency, Closed
// Date) don't have a confirmed raw key from any parser already in this
// codebase — they're looked up defensively and simply render as "—" when
// absent rather than guessing at a wrong value.

function toArray(v) {
  return Array.isArray(v) ? v : v != null ? [v] : [];
}

function val(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v.$ !== undefined) return v.$;
  return v;
}

function str(v) {
  const x = val(v);
  return x === null || x === undefined ? "" : String(x);
}

function money(v) {
  const x = val(v);
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "number" ? x : parseFloat(String(x).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function last4(v) {
  return str(v).replace(/\D/g, "").slice(-4);
}

function bureauCodeFromSymbol(s) {
  const x = str(s).toUpperCase();
  if (x.includes("TRANS") || x === "TUC" || x === "TU") return "TU";
  if (x.includes("EXP") || x === "XPN" || x === "EX") return "EX";
  if (x.includes("EQUI") || x === "EQF" || x === "EFX" || x === "EQ") return "EQ";
  return "";
}

const BUREAU_LABEL = { TU: "TransUnion", EX: "Experian", EQ: "Equifax" };

/** Standard Metro2 payment-history status codes — 0 is current/on-time,
 * 1-6 are progressively later delinquency buckets, 7 is wage-earner plan,
 * 8 is repossession, 9 is charge-off/collection, X/blank is no data for
 * that month. */
const PAY_STATUS_LABEL = {
  "0": "OK",
  "1": "30",
  "2": "60",
  "3": "90",
  "4": "120",
  "5": "150",
  "6": "180+",
  "7": "WEP",
  "8": "Repo",
  "9": "CO",
};

function findMergeBody(rawData) {
  const root = rawData?.report || rawData;
  const bundleRaw = root?.BundleComponents?.BundleComponent ?? root?.BundleComponents ?? [];
  const bundle = toArray(bundleRaw);
  const mergeComp = bundle.find((c) => c?.Type === "MergeCreditReports") || bundle[0];
  return mergeComp?.TrueLinkCreditReportType || mergeComp?.creditReport || null;
}

function buildPersonalInfo(merge) {
  const out = { TU: {}, EX: {}, EQ: {} };
  const names = toArray(merge?.Borrower?.BorrowerName);
  const addresses = toArray(merge?.Borrower?.BorrowerAddress);
  const birth = toArray(merge?.Borrower?.Birth)[0];

  // Names/DOB in this bundle shape aren't reliably tagged per-bureau the
  // way addresses are (Source.Bureau) — SmartCredit's own Classic Report
  // shows one name variant per bureau column, so this best-effort splits
  // by array position when there are 1-3 entries, falling back to the
  // first name for any bureau without its own entry.
  const nameFor = (i) => {
    const n = names[i] || names[0];
    if (!n?.Name) return "";
    const { first, middle, last } = n.Name;
    return [str(first), str(middle), str(last)].filter(Boolean).join(" ").toUpperCase();
  };
  ["TU", "EX", "EQ"].forEach((b, i) => {
    out[b].name = nameFor(i);
    out[b].dob = birth ? str(birth.date).slice(0, 4) : "";
  });

  addresses.forEach((a, idx) => {
    const ad = a?.CreditAddress;
    if (!ad) return;
    const bureau = bureauCodeFromSymbol(a?.Source?.Bureau?.symbol || a?.Source?.Bureau?.abbreviation) || null;
    const line = str(ad.unparsedStreet) || [ad.houseNumber, ad.streetName, ad.streetType].map(str).filter(Boolean).join(" ");
    const cityLine = [str(ad.city), str(ad.stateCode)].filter(Boolean).join(", ") + (ad.postalCode ? ` ${str(ad.postalCode)}` : "");
    const entry = { line, cityLine, dateReported: str(a.dateReported) };
    const targets = bureau ? [bureau] : ["TU", "EX", "EQ"];
    targets.forEach((b) => {
      if (!out[b].currentAddress) out[b].currentAddress = entry;
      else if (!out[b].previousAddresses) out[b].previousAddresses = [entry];
      else out[b].previousAddresses.push(entry);
    });
  });

  return out;
}

function accountGroupFor(typeAbbrev, typeDesc) {
  const t = `${str(typeAbbrev)} ${str(typeDesc)}`.toLowerCase();
  if (t.includes("mortgage") || t.includes("real estate")) return "Mortgage Accounts";
  if (t.includes("instal") || t.includes("auto") || t.includes("student") || t.includes("personal loan")) return "Installment Accounts";
  if (t.includes("coll")) return "Collection Accounts";
  return "Revolving Accounts";
}

function buildTradelineColumn(tl, partition) {
  const openClosed = str(tl?.OpenClosed?.description) || str(tl?.OpenClosed) || "";
  return {
    accountNumber: str(tl?.accountNumber) || last4(tl?.accountNumber),
    highBalance: money(tl?.GrantedTrade?.highCredit ?? tl?.highBalance ?? tl?.highCredit),
    lastVerified: str(tl?.dateVerified),
    dateOfLastActivity: str(tl?.dateAccountStatus) || str(tl?.lastPaymentDate),
    dateReported: str(tl?.dateReported),
    dateOpened: str(tl?.dateOpened),
    balanceOwed: money(tl?.currentBalance ?? tl?.GrantedTrade?.currentBalance),
    closedDate: str(tl?.dateClosed) || str(tl?.GrantedTrade?.dateClosed),
    accountRating: openClosed,
    // Confirmed against real data — a separate field from PayStatus,
    // e.g. "Derogatory" — a useful at-a-glance flag the PDF doesn't call
    // out explicitly but is worth surfacing.
    accountCondition: str(tl?.AccountCondition?.description),
    accountDescription: str(tl?.AccountDesignator?.description),
    disputeStatus: str(tl?.DisputeFlag?.description) || "Account not disputed",
    creditorType: str(tl?.IndustryCode?.description),
    accountStatus: openClosed,
    paymentStatus: str(tl?.PayStatus?.description),
    creditorRemarks: toArray(tl?.Remark).map((r) => str(r?.RemarkCode?.description) || str(r?.customRemark)).filter(Boolean).join("; "),
    paymentAmount: money(tl?.GrantedTrade?.monthlyPaymentAmount ?? tl?.GrantedTrade?.monthlyPayment),
    lastPayment: str(tl?.GrantedTrade?.dateLastPayment) || str(tl?.lastPaymentDate),
    termLength: str(tl?.GrantedTrade?.termMonths),
    pastDueAmount: money(tl?.GrantedTrade?.amountPastDue ?? tl?.amountPastDue) ?? 0,
    accountType: str(tl?.GrantedTrade?.AccountType?.description) || str(partition?.accountTypeDescription),
    paymentFrequency: str(tl?.GrantedTrade?.PaymentFrequency?.description),
    creditLimit: money(tl?.GrantedTrade?.CreditLimit ?? tl?.creditLimit),
    utilizationPct: (() => {
      const limit = money(tl?.GrantedTrade?.CreditLimit ?? tl?.creditLimit) || 0;
      const bal = money(tl?.currentBalance ?? tl?.GrantedTrade?.currentBalance) || 0;
      return limit > 0 ? Math.round((bal / limit) * 100) : null;
    })(),
    // 24-char status string, one code per month, oldest -> newest, per the
    // standard Metro2 payment-history convention (see PAY_STATUS_LABEL).
    paymentHistory: str(tl?.GrantedTrade?.PayStatusHistory?.status).split("").filter(Boolean),
    daysLate: {
      d30: Number(val(tl?.GrantedTrade?.late30Count ?? tl?.PayStatus?.late30Count ?? tl?.late30Count)) || 0,
      d60: Number(val(tl?.GrantedTrade?.late60Count ?? tl?.PayStatus?.late60Count ?? tl?.late60Count)) || 0,
      d90: Number(val(tl?.GrantedTrade?.late90Count ?? tl?.PayStatus?.late90Count ?? tl?.late90Count)) || 0,
    },
  };
}

function buildAccounts(merge) {
  const partitions = toArray(merge?.TradeLinePartition);
  // Match tradelines belonging to the same logical account across bureaus
  // by creditor name + last-4 account number — same identity rule used by
  // utils/creditAnalysis.js's negative-matching, kept consistent here.
  const groups = new Map();

  // Match on account-number last-4 alone when both sides have one, NOT
  // name+number combined — confirmed against real data that the same
  // account routinely gets a different creditor-name spelling per bureau
  // (e.g. "CHRYSLERCAP" on TransUnion vs "CHRYSLER CAPITAL" on Experian,
  // same account number). Requiring an exact name match on top of the
  // account number would split that into two separate account cards
  // instead of one with a TU/EX column each — same "account number is the
  // real identity" principle utils/creditAnalysis.js's matching already
  // uses. Falls back to a name-based key only when neither side has a
  // usable account number.
  const byAccountNumber = new Map(); // last4 -> group key
  partitions.forEach((part) => {
    const partBureau = bureauCodeFromSymbol(part?.bureau || part?.creditReportSource);
    toArray(part?.Tradeline).forEach((tl) => {
      const bureau = bureauCodeFromSymbol(tl?.bureau) || partBureau;
      if (!bureau) return;
      const creditor = str(tl?.creditorName) || str(tl?.subscriberName) || "Unknown Creditor";
      const acctLast4 = last4(tl?.accountNumber);

      let key = acctLast4 && byAccountNumber.has(acctLast4) ? byAccountNumber.get(acctLast4) : null;
      if (!key) {
        key = acctLast4 ? `#${acctLast4}` : `${creditor.toUpperCase()}|`;
        if (acctLast4) byAccountNumber.set(acctLast4, key);
      }

      if (!groups.has(key)) {
        groups.set(key, {
          creditor,
          group: accountGroupFor(part?.accountTypeAbbreviation, part?.accountTypeDescription),
          byBureau: {},
        });
      }
      groups.get(key).byBureau[bureau] = buildTradelineColumn(tl, part);
    });
  });

  const byGroup = { "Mortgage Accounts": [], "Revolving Accounts": [], "Installment Accounts": [], "Collection Accounts": [] };
  groups.forEach((acc) => {
    (byGroup[acc.group] || byGroup["Revolving Accounts"]).push(acc);
  });
  return byGroup;
}

function buildPublicRecords(merge) {
  const partitions = toArray(merge?.PublicRecordPartition);
  const flat = partitions.length
    ? partitions.flatMap((p) => toArray(p?.PublicRecord).map((pr) => ({ pr, bureau: p?.bureau })))
    : toArray(merge?.PublicRecord).map((pr) => ({ pr, bureau: null }));

  return flat.map(({ pr, bureau }) => ({
    type: str(pr?.Type?.description) || str(pr?.Type) || "Public Record",
    bureau: bureauCodeFromSymbol(bureau || pr?.bureau || pr?.Source?.Bureau?.symbol),
    dateFiled: str(pr?.dateFiled),
    referenceNumber: str(pr?.referenceNumber),
    amount: money(pr?.amount),
    status: str(pr?.Status?.description) || str(pr?.Status),
    courtName: str(pr?.courtName),
  }));
}

function buildInquiries(merge, knownCreditors) {
  const partitions = toArray(merge?.InquiryPartition);
  const all = partitions.flatMap((part) =>
    toArray(part?.Inquiry).map((i) => ({
      date: str(i?.inquiryDate) || str(i?.InquiryDate) || str(i?.date) || str(i?.Date),
      creditor: str(i?.subscriberName) || str(i?.creditorName) || str(i?.Creditor),
      bureau: bureauCodeFromSymbol(i?.bureau || part?.bureau || i?.Source?.Bureau?.symbol),
    })),
  );

  const knownUpper = new Set(Array.from(knownCreditors).map((c) => c.toUpperCase()));
  const isMatch = (creditor) => {
    const c = creditor.toUpperCase();
    // Loose substring match either direction — inquiry subscriber names
    // and account creditor names are frequently abbreviated differently
    // for the same company (e.g. "SOFI BANK NA" vs "SOFI BANK").
    for (const known of knownUpper) {
      if (!known) continue;
      if (c.includes(known) || known.includes(c)) return true;
    }
    return false;
  };

  return {
    match: all.filter((i) => isMatch(i.creditor)),
    noMatch: all.filter((i) => !isMatch(i.creditor)),
  };
}

function buildCreditorContacts(merge) {
  // merge.Subscriber is a top-level array (confirmed against a real
  // exported raw_credit_report.json — 35 entries there) with
  // {name, telephone, CreditAddress:{city,stateCode,unparsedStreet,
  // postalCode}} per creditor/subscriber referenced anywhere in the
  // report. This replaces an earlier best-effort guess at a per-tradeline
  // Subscriber field that doesn't actually exist in the real bundle shape
  // (that version would have rendered this section empty for every real
  // client).
  const subscribers = toArray(merge?.Subscriber);
  const contacts = new Map();
  subscribers.forEach((sub) => {
    const name = str(sub?.name);
    if (!name) return;
    const key = name.toUpperCase();
    if (contacts.has(key)) return;
    const phone = str(sub?.telephone);
    const addr = sub?.CreditAddress;
    const addressLines = addr
      ? [str(addr.unparsedStreet).trim(), [str(addr.city).trim(), str(addr.stateCode), str(addr.postalCode)].filter(Boolean).join(", ")].filter(Boolean)
      : [];
    if (!phone && addressLines.length === 0) return;
    contacts.set(key, { name, phone, address: addressLines });
  });
  return Array.from(contacts.values());
}

/** Main entry point — takes the raw SmartCredit report JSON (the same
 * payload saved to raw_credit_report.json) and returns the full Classic
 * Report structure. Returns null if the bundle can't be located at all. */
export function buildClassicReport(rawData) {
  const merge = findMergeBody(rawData);
  if (!merge) return null;

  const scores = {};
  // Scores live on separate bundle components (EXPVantageScoreV6 etc), not
  // on the merge body — same lookup credit_analysis's extractVantageScore
  // does, kept minimal here since only the numeric score is needed.
  const root = rawData?.report || rawData;
  const bundleArr = toArray(root?.BundleComponents?.BundleComponent ?? root?.BundleComponents);
  const bundleMap = {};
  bundleArr.forEach((b) => {
    if (b?.Type) bundleMap[b.Type] = b;
  });
  ["EX", "TU", "EQ"].forEach((code) => {
    const key = `${code === "EX" ? "EXP" : code === "TU" ? "TUC" : "EQF"}VantageScoreV6`;
    const node = bundleMap[key];
    const cst = node?.CreditScoreType ?? node?.VantageScore ?? node;
    scores[code] = Number(val(cst?.riskScore ?? cst?.Score ?? cst?.score)) || null;
  });

  const accountsByGroup = buildAccounts(merge);
  const knownCreditors = new Set();
  Object.values(accountsByGroup).forEach((list) => list.forEach((a) => knownCreditors.add(a.creditor)));

  // Summary is genuinely per-bureau in the raw bundle (Summary.
  // TradelineSummary keyed by "Experian"/"Equifax"/"TransUnion"/"Merge"),
  // matching the PDF's actual 3-column Summary section — confirmed against
  // a real exported raw_credit_report.json, where each bureau reports
  // different totals (e.g. different TotalAccounts/TotalBalances per
  // bureau). Reading only .Merge (one combined number) would collapse
  // that real disagreement between bureaus into a single figure, which is
  // exactly the kind of bureau-to-bureau discrepancy a credit report is
  // supposed to surface.
  const summary = merge?.Summary || {};
  const tlSummaryByBureau = summary?.TradelineSummary || {};
  const inqSummaryByBureau = summary?.InquirySummary || {};
  const prSummaryByBureau = summary?.PublicRecordSummary || {};
  const BUREAU_SUMMARY_KEY = { TU: "TransUnion", EX: "Experian", EQ: "Equifax" };

  const summaryByBureau = {};
  ["TU", "EX", "EQ"].forEach((code) => {
    const key = BUREAU_SUMMARY_KEY[code];
    const tlS = tlSummaryByBureau[key] || {};
    summaryByBureau[code] = {
      totalAccounts: Number(val(tlS?.TotalAccounts)) || 0,
      openAccounts: Number(val(tlS?.OpenAccounts)) || 0,
      closedAccounts: Number(val(tlS?.CloseAccounts)) || 0,
      delinquent: Number(val(tlS?.DelinquentAccounts)) || 0,
      derogatory: Number(val(tlS?.DerogatoryAccounts)) || 0,
      balances: Number(val(tlS?.TotalBalances)) || 0,
      payments: Number(val(tlS?.TotalMonthlyPayments)) || 0,
      publicRecords: Number(val(prSummaryByBureau[key]?.NumberOfRecords)) || 0,
      inquiries2yr: Number(val(inqSummaryByBureau[key]?.NumberInLast2Years)) || 0,
    };
  });

  return {
    reportDate: new Date().toISOString().slice(0, 10),
    scores,
    personal: buildPersonalInfo(merge),
    summary: summaryByBureau,
    accounts: accountsByGroup,
    publicRecords: buildPublicRecords(merge),
    inquiries: buildInquiries(merge, knownCreditors),
    creditorContacts: buildCreditorContacts(merge),
  };
}

export { PAY_STATUS_LABEL, BUREAU_LABEL };
