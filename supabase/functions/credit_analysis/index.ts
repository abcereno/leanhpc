/** v3
 * supabase/functions/credit_analysis/index.ts
 * ROBUST VERSION: Fixes .toLowerCase() crashes on non-string values.
 *
 * Brought into the repo from the Supabase dashboard-only copy on
 * 2026-08-15 (source's own header comment said
 * "smartcredit-scrape-and-analyze" — kept the folder name as
 * `credit_analysis` to match what Fetch3bModal.jsx actually calls:
 * `${VITE_SUPABASE_URL}/functions/v1/credit_analysis`). Deploy with
 * `supabase functions deploy credit_analysis`.
 *
 * 2026-08-20: accepts an optional `rawReport` in the POST body. Before
 * this, every caller that wanted analysis data made this function do its
 * OWN separate SmartCredit login+fetch — on top of fetch_3b_raw doing the
 * exact same login+fetch for the raw archive, and fetch_3b_report doing it
 * a THIRD time for the dispute thread. Three logins per "fetch report"
 * action tripled the odds of hitting SmartCredit's Cloudflare bot-challenge
 * on any given attempt, and meant the three resulting files could
 * technically be parsed from three slightly different fetches of "the same"
 * report. Callers that already fetched the raw report once (Fetch3bModal.jsx,
 * reportAutoImport.js) now pass it as `rawReport` so this function skips
 * straight to parsing instead of logging in again. `email`/`password` login
 * is kept as a fallback for any caller that doesn't have a raw report in
 * hand yet.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { proxiedFetch } from "../_shared/proxy.ts";

/* ----------------------------- Constants ---------------------------------- */

const SMARTCREDIT_LOGIN_URL = "https://www.smartcredit.com/external-login";
const SMARTCREDIT_JSON_URL =
  "https://www.smartcredit.com/member/credit-report/3b/simple.htm?format=JSON";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/* ----------------------------- Small Helpers ------------------------------ */

/**
 * Ensure a value is always returned as an array.
 */
function toArray<T>(v: T | T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : v != null ? [v] : [];
}

/** * [FIX] Lower-case safe helper.
 * Forces input to String() before calling toLowerCase to prevent crashes on numbers.
 */
const lower = (s: any) => String(s || "").toLowerCase();

/** Number guard. */
const isNum = (v: unknown) => typeof v === "number" && !isNaN(v as number);

/**
 * Parse the first numeric-like value from a list of inputs.
 * Accepts strings with commas/spaces.
 */
function safeFloat(...vals: unknown[]): number {
  for (const v of vals) {
    if (v == null) continue;
    const n = typeof v === "string" ? parseFloat(v.replace(/[, ]/g, "")) : (v as number);
    if (isNum(n)) return n as number;
  }
  return 0;
}

/** Quick heuristic for card issuers. */
const CARD_ISSUER_RX =
  /(AMEX|CAP(ITAL)? ?ONE|DISCOV(ER|ERC)|CITI(BANK|CARD)?|BARCLAY(S|SBK)|CHASE|JPMCB|SYN?CB|WELLS|BOFA|BK OF AMER|GS BANK|APPLE CARD|US BANK|CAP ONE)/i;

/**
 * Guess if a tradeline is revolving/credit-card-like.
 */
function guessRevolving(a: any): boolean {
  const t = lower(a.type || "");
  return t.includes("rev") || t.includes("credit card") || t === "r" || CARD_ISSUER_RX.test(String(a.creditor || ""));
}

/**
 * Pick an effective limit:
 * - use creditLimit when present/positive,
 * - else if revolving, fall back to highCredit,
 * - else 0.
 */
function effectiveLimit(a: any): number {
  return a.creditLimit && a.creditLimit > 0 ? a.creditLimit : guessRevolving(a) ? a.highCredit || 0 : 0;
}

/** Normalize a bureau name/code to EX/TU/EQ/"" */
function bureauKey(s: string): "EX" | "TU" | "EQ" | "" {
  const x = lower(s);
  if (x.includes("experian") || x === "ex") return "EX";
  if (x.includes("transunion") || x === "tu") return "TU";
  if (x.includes("equifax") || x === "eq") return "EQ";
  return "";
}

/** Map bureau short code to display name. */
function bureauName(code: string) {
  return code === "EX" ? "Experian" : code === "TU" ? "TransUnion" : code === "EQ" ? "Equifax" : "";
}

/* --------------------------- Score Extraction ----------------------------- */

/**
 * Extract one VantageScore block by bundle key.
 * Supports several schema variants within the bundle component.
 */
function extractVantageScore(bundleMap: Record<string, any>, key: string) {
  const node = bundleMap[key];
  if (!node) return null;

  const cst = node.CreditScoreType ?? node.VantageScore ?? node;

  const score = safeFloat(cst?.riskScore, cst?.Score, cst?.score, cst?.Results?.Score) || 0;
  const date =
    cst?.ScoreDate ||
    cst?.scoreDate ||
    cst?.Date ||
    cst?.Source?.InquiryDate ||
    cst?.Results?.Date ||
    node?.Date;

  const model =
    cst?.CreditScoreModel?.description ||
    cst?.CreditScoreModel?.abbreviation ||
    "VantageScore 3.0/4.0/6";

  const rawFactors =
    cst?.CreditScoreFactor ??
    cst?.ScoreFactors?.Reason ??
    cst?.ScoreFactors ??
    cst?.Reasons?.Reason ??
    [];

  const factors = toArray(rawFactors).map((r) => {
    const code = r?.bureauCode || r?.code || r?.Code || r?.Factor?.symbol || "";
    const type = r?.FactorType || r?.type || "";

    const text = Array.isArray(r?.FactorText)
      ? (r.FactorText.find(
          (x: any) => typeof x?.FactorText === "string" && lower(x.FactorText).startsWith("factor:")
        )?.FactorText ||
          String(r.FactorText[0]?.FactorText || "")
        ).replace(/^factor:\s*/i, "")
      : r?.FactorText || r?.text || r?.description || r?.Description || r?.Factor?.description || "";

    return { code, type, text };
  });

  return { score, date, model, factors };
}

/* ---------------------------- Entity Parsers ------------------------------ */

/**
 * Parse/normalize a single tradeline (as seen in SmartCredit visual/JSON).
 * - Captures common fields and several alternates observed in reports.
 */
function parseTradeline(tl: any, fallbackBureau: string, partitionType: string) {
  const creditor = tl?.creditorName || tl?.Name || tl?.subscriberName || tl?.subscriber || "";
  const acctNum =
    tl?.accountNumber?.slice?.(-4) ||
    tl?.accountNumberMasked?.slice?.(-4) ||
    tl?.displayAccountNumber?.slice?.(-4) ||
    "";

  const generalAccountType =
    tl?.accountTypeAbbreviation || tl?.accountType || tl?.PortfolioType || tl?.industryCode || partitionType || "";

  // Core fields
  const dateOpened = tl?.dateOpened || tl?.OpenedDate || tl?.openDate || "";
  const openClosed = tl?.OpenClosed?.description || tl?.OpenClosed || tl?.accountStatus || "";
  const currentBalance = safeFloat(tl?.currentBalance, tl?.CurrentBalance, tl?.GrantedTrade?.currentBalance);
  const creditLimit = safeFloat(tl?.creditLimit, tl?.GrantedTrade?.CreditLimit, tl?.creditLine);
  const highCredit = safeFloat(tl?.highCredit, tl?.highBalance, tl?.GrantedTrade?.highCredit);
  const pastDue = safeFloat(tl?.pastDue, tl?.amountPastDue, tl?.GrantedTrade?.amountPastDue, tl?.GrantedTrade?.pastDue);
  const lastPaymentDate = tl?.lastPaymentDate || tl?.GrantedTrade?.dateLastPayment || "";
  const status = tl?.PayStatus?.description || tl?.accountCondition || "";

  // Late payment counts
  const late30 = safeFloat(tl?.GrantedTrade?.late30Count, tl?.PayStatus?.late30Count, tl?.late30Count);
  const late60 = safeFloat(tl?.GrantedTrade?.late60Count, tl?.PayStatus?.late60Count, tl?.late60Count);
  const late90 = safeFloat(tl?.GrantedTrade?.late90Count, tl?.PayStatus?.late90Count, tl?.late90Count);

  // Bureau (raw label in this scrape)
  const bureau = tl?.bureau || tl?.creditBureau || tl?.Subscriber?.bureau || tl?.source || fallbackBureau || "";

  // Extra detail
  const dateVerified = tl?.dateVerified || "";
  const dateReported = tl?.dateReported || "";
  const dateLastActivity = tl?.dateAccountStatus || "";
  const accountDescription = tl?.AccountDesignator?.description || "";
  const disputeStatus = tl?.DisputeFlag?.description || "";
  const creditorType = tl?.IndustryCode?.description || "";
  const monthlyPayment = safeFloat(tl?.GrantedTrade?.monthlyPayment);
  const termMonths = safeFloat(tl?.GrantedTrade?.termMonths);
  const specificAccountType = tl?.GrantedTrade?.AccountType?.description || "";
  const creditorRemarks = toArray(tl?.Remark)
    .map((r) => r?.RemarkCode?.description || r?.customRemark)
    .filter(Boolean)
    .join("; ");

  return {
    bureau,
    creditor,
    accountNumberLast4: acctNum,
    type: generalAccountType,
    dateOpened,
    openClosed,
    currentBalance,
    creditLimit,
    highCredit,
    pastDue,
    lastPaymentDate,
    status,
    late30,
    late60,
    late90,
    dateVerified,
    dateReported,
    dateLastActivity,
    accountDescription,
    disputeStatus,
    creditorType,
    monthlyPayment,
    termMonths,
    specificAccountType,
    creditorRemarks,
  };
}

/** Identify collections/charge-offs. */
function isCollection(a: any): boolean {
  const t = lower(a.type || "");
  const s = lower(a.status || "");
  return t.includes("coll") || s.includes("collection") || s.includes("charge off") || s.includes("charge-off");
}

/** Any negative indicator (lates or collection). */
function isNegative(a: any): boolean {
  return isCollection(a) || (a.late30 || 0) > 0 || (a.late60 || 0) > 0 || (a.late90 || 0) > 0;
}

/** Parse a single inquiry row. */
function parseInquiry(inq: any, fallbackBureau: string) {
  return {
    date: inq?.inquiryDate || inq?.Date || inq?.date || "",
    creditor: inq?.subscriberName || inq?.subscriber || inq?.Creditor || "",
    bureau: inq?.bureau || inq?.creditBureau || inq?.source || fallbackBureau || "",
  };
}

/** Parse a single public record entry. */
function parsePublicRecord(pr: any, fallbackBureau: string) {
  return {
    bureau: pr?.bureau || pr?.creditBureau || pr?.source || fallbackBureau || "",
    type: pr?.type || pr?.description || pr?.PublicRecordType || "",
    filed: pr?.dateFiled || pr?.filedDate || pr?.Date || "",
    status: pr?.status || pr?.CurrentStatus || "",
    amount: safeFloat(pr?.amount, pr?.LiabilityAmount),
    reference: pr?.caseNumber || pr?.DocketNumber || pr?.ReferenceNumber || "",
  };
}

/* ------------------------ Merge & Summary Utilities ----------------------- */

const BUREAU_PRIORITY: Record<string, number> = { TU: 3, EX: 2, EQ: 1, "": 0 };

/**
 * Merge tradelines across bureaus using a stable key, preferring TU for the primary.
 * Adds:
 * - primary_bureau: "EX" | "TU" | "EQ"
 * - reported_to: ["EX"|"TU"|"EQ"...]
 * - per_bureau: per-bureau numeric/status snapshots
 */
function mergeAccountsPreferTU(raw: any[]) {
  const map: Record<string, any> = {};

  // [FIX] Ensure creditor is string before replace/trim/toUpperCase
  function normalizeCreditor(s: any) {
    return String(s || "").replace(/\s+/g, " ").trim().toUpperCase();
  }

  function keyFor(a: any) {
    const cred = normalizeCreditor(a.creditor || "");
    const last4 = String(a.accountNumberLast4 || "");
    const opened = String(a.dateOpened || "").slice(0, 7);
    const baseType = String(a.type || "").split("/")[0].trim().toUpperCase();
    return `${cred}|${last4 || opened}|${baseType}`;
  }

  for (const a of raw) {
    const code = bureauKey(a.bureau);
    if (!code) continue;

    const k = keyFor(a);
    const rank = BUREAU_PRIORITY[code];

    if (!map[k]) {
      map[k] = {
        ...a,
        bureau: bureauName(code),
        primary_bureau: code,
        reported_to: [code],
        per_bureau: {
          [code]: {
            status: a.status,
            openClosed: a.openClosed,
            currentBalance: a.currentBalance,
            creditLimit: a.creditLimit,
            highCredit: a.highCredit,
            pastDue: a.pastDue,
            late30: a.late30,
            late60: a.late60,
            late90: a.late90,
          },
        },
        _rank: rank,
      };
      continue;
    }

    const cur = map[k];
    if (!cur.reported_to.includes(code)) cur.reported_to.push(code);

    cur.per_bureau[code] = {
      status: a.status,
      openClosed: a.openClosed,
      currentBalance: a.currentBalance,
      creditLimit: a.creditLimit,
      highCredit: a.highCredit,
      pastDue: a.pastDue,
      late30: a.late30,
      late60: a.late60,
      late90: a.late90,
    };

    if (rank > cur._rank) {
      cur.primary_bureau = code;
      cur.bureau = bureauName(code);
      cur._rank = rank;
    }

    cur.late30 = Math.max(cur?.late30 || 0, a?.late30 || 0);
    cur.late60 = Math.max(cur?.late60 || 0, a?.late60 || 0);
    cur.late90 = Math.max(cur?.late90 || 0, a?.late90 || 0);
  }

  return Object.values(map).map((x: any) => {
    delete x._rank;
    return x;
  });
}

/** Pick summary blocks if present in the merged node. */
function pickMergeSummaries(merge: any) {
  const S = merge?.Summary || merge?.summary || {};
  const TL = S?.TradelineSummary || S?.Tradelines || {};
  const TL_M = TL?.Merge || TL?.MERGE || null;

  const INQ = S?.InquirySummary || {};
  const INQ_M = INQ?.Merge || INQ?.MERGE || null;

  const PR = S?.PublicRecordSummary || {};
  const PR_M = PR?.Merge || PR?.MERGE || null;

  return { TL_M, INQ_M, PR_M };
}

/** Integerify a numeric-ish value. */
function i(v: unknown) {
  const n = safeFloat(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/* --------------------------------- Serve ---------------------------------- */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST allowed" }), {
      status: 405,
      headers,
    });
  }

  try {
    /* ----------------------------- Read Body ------------------------------ */
    const body = await req.json().catch(() => ({}));
    const { email, password, months = 24, rawReport } = body || {};

    let report: any;

    if (rawReport) {
      // Already-fetched raw report handed to us (see 2026-08-20 header
      // note) — skip the login+fetch entirely and go straight to parsing.
      report = rawReport;
    } else {
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Missing email or password" }), {
          status: 400,
          headers,
        });
      }

      /* ------------------------------ Login -------------------------------- */
      // Routed through the static-IP proxy (see ../_shared/proxy.ts) so
      // ConsumerDirect can whitelist a fixed IP for this legacy
      // external-login path.
      const loginRes = await proxiedFetch(SMARTCREDIT_LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
        },
        body: new URLSearchParams({
          loginType: "PARTNER_API",
          j_username: email,
          j_password: password,
        }),
      });

      // Read as text FIRST, not .json() directly — the previous version's
      // `.json().catch(() => ({}))` silently swallowed a non-JSON response
      // into an empty object, so a changed SmartCredit login response (e.g.
      // reverted to an HTML page for this login type) looked identical to a
      // plain credential rejection: both just said "Login failed" with
      // nothing else to go on. This tells the two apart and reports exactly
      // what SmartCredit sent back either way.
      const loginRawText = await loginRes.text();
      let loginBody: any = null;
      try {
        loginBody = JSON.parse(loginRawText);
      } catch {
        return new Response(
          JSON.stringify({
            error: "Login response was not JSON — SmartCredit's login endpoint response format may have changed",
            loginStatus: loginRes.status,
            loginContentType: loginRes.headers.get("content-type") || null,
            rawPreview: loginRawText.slice(0, 800),
          }),
          { status: 502, headers },
        );
      }

      if (!loginBody?.success) {
        // Previously just "Login failed" with nothing else. Now returns
        // SmartCredit's actual response body, which should show either a
        // real rejection reason (bad credentials, MFA required, IP/bot
        // block) or a renamed/moved success field if the endpoint's
        // response shape itself changed.
        return new Response(
          JSON.stringify({
            error: "Login failed",
            loginStatus: loginRes.status,
            smartCreditResponse: loginBody,
          }),
          { status: 401, headers },
        );
      }

      // Grab SmartCredit session cookie
      const setCookie = loginRes.headers.get("set-cookie") || "";
      const jsessionMatch = setCookie.match(/JSESSIONID=[^;]+/);
      if (!jsessionMatch) {
        return new Response(JSON.stringify({ error: "No JSESSIONID found" }), {
          status: 500,
          headers,
        });
      }
      const jsessionId = jsessionMatch[0];

      /* -------------------------- Fetch 3B JSON ---------------------------- */
      // Same proxy, same reasoning.
      const reportRes = await proxiedFetch(SMARTCREDIT_JSON_URL, {
        headers: { Cookie: jsessionId, "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });

      const ct = reportRes.headers.get("content-type") || "";

      if (ct.includes("application/json")) {
        report = await reportRes.json();
      } else {
        // Fallback: extract JSON embedded in HTML
        const html = await reportRes.text();
        const match = html.match(/<div id="TokenDisplay">\s*(\{.*?\})\s*<\/div>/s);
        if (!match) {
          return new Response(
            JSON.stringify({
              error: "Could not extract JSON from HTML response",
              reportStatus: reportRes.status,
              htmlPreview: html.slice(0, 500),
            }),
            { status: 500, headers },
          );
        }
        try {
          report = JSON.parse(match[1]);
        } catch (err) {
          return new Response(
            JSON.stringify({
              error: "Failed to parse embedded JSON",
              detail: String((err as any)?.message || err),
            }),
            { status: 500, headers },
          );
        }
      }
    }

    /* -------------------------- Bundle / Merge --------------------------- */
    const raw = report?.BundleComponents?.BundleComponent ?? report?.BundleComponents ?? [];
    const bundleArr = toArray(raw);
    const bundleMap: Record<string, any> = {};
    for (const b of bundleArr) if (b?.Type) bundleMap[b.Type] = b;

    const merge = bundleMap["MergeCreditReports"]?.TrueLinkCreditReportType;
    if (!merge) {
      return new Response(JSON.stringify({ error: "Merged report missing (TrueLinkCreditReportType)" }), {
        status: 500,
        headers,
      });
    }

    /* ----------------------------- Identity ------------------------------ */
    const borrower = merge.Borrower || {};
    const borrowerName = toArray(borrower.BorrowerName)[0]?.Name;
    const borrowerAddress = toArray(borrower.BorrowerAddress)[0]?.CreditAddress;

    const client = {
      full_name: `${borrowerName?.first || ""} ${borrowerName?.last || ""}`.trim(),
      address: borrowerAddress
        ? `${borrowerAddress.houseNumber || ""} ${borrowerAddress.streetName || ""} ${borrowerAddress.streetType || ""}, ${borrowerAddress.city || ""}, ${borrowerAddress.stateCode || ""} ${borrowerAddress.postalCode || ""}`
            .replace(/\s\s+/g, " ")
            .trim()
        : "",
      dob: toArray(borrower.Birth)[0]?.date || "",
      ssn_last4: (borrower.SocialSecurityNumber || "").slice(-4),
    };

    /* ------------------------------ Scores ------------------------------- */
    const scores = {
      EX: extractVantageScore(bundleMap, "EXPVantageScoreV6"),
      TU: extractVantageScore(bundleMap, "TUCVantageScoreV6"),
      EQ: extractVantageScore(bundleMap, "EQFVantageScoreV6"),
      "": null as null,
    };

    const asOf = scores.EX?.date || scores.TU?.date || scores.EQ?.date || report?.Date;

    /* ---------------------------- Tradelines ----------------------------- */
    const tlPartitions = toArray(merge.TradeLinePartition);
    const accounts_raw: any[] = [];
    for (const part of tlPartitions) {
      const partBureau = part?.bureau || "";
      const partType = part?.accountTypeAbbreviation || "";
      const tls = toArray(part?.Tradeline);
      for (const tl of tls) accounts_raw.push(parseTradeline(tl, partBureau, partType));
    }

    const accounts = mergeAccountsPreferTU(accounts_raw);

    /* ----------------------------- Inquiries ----------------------------- */
    const inquiryPartitions = toArray(merge.InquiryPartition);
    const allInquiries: any[] = [];
    for (const ip of inquiryPartitions) {
      const partBureau = ip?.bureau || "";
      const inqs = toArray(ip?.Inquiry);
      for (const q of inqs) allInquiries.push(parseInquiry(q, partBureau));
    }

    // Optional time window filter
    let filteredInquiries = allInquiries;
    if (months && Number(months) > 0) {
      const cutoff = new Date();
      const cutoffNum = cutoff.setMonth(cutoff.getMonth() - Number(months));
      filteredInquiries = allInquiries.filter((x) => {
        const d = new Date(x.date || "");
        return !isNaN(+d) && d.getTime() >= cutoffNum;
      });
    }

    // Grouped by bureau (human label in this scrape)
    const inquiries = {
      EX: filteredInquiries
        .filter((i) => lower(i.bureau) === "experian")
        .map(({ date, creditor }) => ({ date, creditor })),
      TU: filteredInquiries
        .filter((i) => lower(i.bureau) === "transunion")
        .map(({ date, creditor }) => ({ date, creditor })),
      EQ: filteredInquiries
        .filter((i) => lower(i.bureau) === "equifax")
        .map(({ date, creditor }) => ({ date, creditor })),
      "": [] as Array<{ date: string; creditor: string }>,
    };

    /* --------------------------- Public Records -------------------------- */
    let public_records: any[] = [];
    if (merge.PublicRecordPartition) {
      const parts = toArray(merge.PublicRecordPartition);
      public_records = parts.flatMap((part) =>
        toArray(part.PublicRecord).map((p) => parsePublicRecord(p, part?.bureau || "")),
      );
    } else {
      public_records = toArray(merge.PublicRecord).map((p) => parsePublicRecord(p, ""));
    }

    /* --------------------------- Summary Blocks -------------------------- */
    const { TL_M, INQ_M, PR_M } = pickMergeSummaries(merge);
    const mergeCounts = {
      accounts_total: i(TL_M?.TotalAccounts),
      open_accounts: i(TL_M?.OpenAccounts),
      closed_accounts: i(TL_M?.CloseAccounts),
      derog_accounts: i(TL_M?.DerogatoryAccounts),
      delinquent_accounts: i(TL_M?.DelinquentAccounts),
      inquiries_total_2y: i(INQ_M?.NumberInLast2Years),
      public_records_total: i(PR_M?.NumberOfRecords),
    };

    /* ----------------------- TU Revolving Utilization -------------------- */
    const rev = accounts_raw.filter((a) => lower(a.bureau) === "transunion" && guessRevolving(a));
    const totalLimit = rev.reduce((s, a) => s + effectiveLimit(a), 0);
    const totalBal = rev.reduce((s, a) => s + (a.currentBalance || 0), 0);
    const usagePct = totalLimit > 0 ? Math.round((totalBal / totalLimit) * 100) : 0;

    /* -------------------------- Negatives List --------------------------- */
    const negatives = accounts.filter(isNegative).map((a) => {
      const late: string[] = [];
      if (a.late30) late.push(`30d x${a.late30}`);
      if (a.late60) late.push(`60d x${a.late60}`);
      if (a.late90) late.push(`90d x${a.late90}`);

      const isColl = isCollection(a);
      const notes = [late.join(", "), isColl ? "Collection/Charge-off" : "", a.status || ""]
        .filter(Boolean)
        .join(" • ");

      return {
        reported_to: a.reported_to,
        bureau: a.primary_bureau || bureauKey(a.bureau) || "",
        account: a.creditor || "",
        issue: isColl ? "Collection / Charge-off" : "Late Payments",
        notes,
      };
    });

    /* --------------------------- Counts Summary -------------------------- */
    const counts = {
      accounts: mergeCounts.accounts_total || accounts.length,
      open: mergeCounts.open_accounts || accounts.filter((a) => /open/i.test(a.openClosed || "")).length,
      closed:
        mergeCounts.closed_accounts || accounts.filter((a) => /clos/i.test(a.openClosed || "")).length,
      collections: accounts.filter(isCollection).length,
      public_records: mergeCounts.public_records_total ?? public_records.length,
      inquiries_total:
        mergeCounts.inquiries_total_2y || inquiries.EX.length + inquiries.TU.length + inquiries.EQ.length,
      inquiries: {
        EX: inquiries.EX.length,
        TU: inquiries.TU.length,
        EQ: inquiries.EQ.length,
      },
      _source: "merge-summary-primary",
    };

    /* --------------------------- Bureau Summary -------------------------- */
    function bureauSummaryFor(code: "EX" | "TU" | "EQ") {
      const name = code === "EX" ? "experian" : code === "TU" ? "transunion" : "equifax";
      const acc = accounts_raw.filter((a) => lower(a.bureau) === name);
      const neg = acc.filter(isNegative);
      const pos = acc.length - neg.length;
      const coll = acc.filter(isCollection).length;
      const open = acc.filter((a) => lower(a.openClosed).includes("open")).length;
      const closed = acc.filter((a) => lower(a.openClosed).includes("closed")).length;
      const inqs = (inquiries as any)[code].length;
      const bal = acc.reduce((s, a) => s + (a.currentBalance || 0), 0);
      return { open, closed, derogatory: neg.length, positive: pos, collections: coll, inquiries_2y: inqs, total_balance: bal };
    }

    const bureau_summary = {
      EX: bureauSummaryFor("EX"),
      TU: bureauSummaryFor("TU"),
      EQ: bureauSummaryFor("EQ"),
    };

    /* ------------------------------ pdfData ------------------------------ */
    const pdfData = {
      client: client,
      report_date: asOf || new Date().toISOString().slice(0, 10),
      monitoring: { provider: "SmartCredit", as_of: asOf },
      scores,
      summary: counts,
      util: { total_limit: totalLimit, current_balance: totalBal, usage_pct: usagePct },
      bureau_summary,
      negatives,
      inquiries: [
        ...inquiries.EX.map((i) => ({ bureau: "EX", ...i })),
        ...inquiries.TU.map((i) => ({ bureau: "TU", ...i })),
        ...inquiries.EQ.map((i) => ({ bureau: "EQ", ...i })),
      ],
      public_records,
      accounts,
      plan: [
        "Validate derogatories with CRAs; request method of verification.",
        "Prioritize recent late payments; goodwill/FCBA routes where applicable.",
        "Sequence disputes in 30–45 day cycles to avoid ‘frivolous’ flags.",
      ],
      next_steps: [
        "Upload Photo ID + proof of address to your portal.",
        "Keep utilization under 9–11%.",
        "Avoid new applications during processing.",
      ],
    };

    /* ----------------------------- Response ------------------------------ */
    return new Response(
      JSON.stringify(
        {
          success: true,
          provider: "SmartCredit",
          as_of: asOf,
          scores,
          counts,
          utilization: { totalLimit, totalBal, usagePct },
          bureau_summary,
          inquiries,
          public_records,
          accounts,
          accounts_raw,
          negatives,
          pdfData,
        },
        null,
        2,
      ),
      { headers },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers,
    });
  }
});
