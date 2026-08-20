// supabase/functions/fetch_3b_report/index.ts
//
// Logs into SmartCredit as the client (same PARTNER_API external-login
// fetch_3b_raw uses) and pulls the 3B JSON report, then parses it down to
// account/inquiry summaries in classify-ready format — see Fetch3bModal.jsx
// (handleFetch3B), reportAutoImport.js, and SmartIdiQModal.jsx, which all
// call this AFTER fetch_3b_raw/credit_analysis to build the actual
// inquiries thread.
//
// Brought into the repo from the Supabase dashboard-only copy on
// 2026-08-20 — this function existed only on the dashboard (never
// committed), so it was still doing a bare fetch() straight to SmartCredit
// and never got the static-IP proxy fix applied to fetch_3b_raw and
// credit_analysis. That's why it kept hitting the same Cloudflare
// bot-challenge (HTML instead of JSON) even after fetch_3b_raw started
// working. See ../_shared/proxy.ts and SMARTCREDIT_PROXY_SETUP.md for the
// proxy background.
//
// Also accepts an optional `rawReport` in the POST body (added same day) —
// skips the login+fetch entirely when the caller already pulled the raw
// report via fetch_3b_raw, so a single "fetch report" action logs into
// SmartCredit once instead of three times (fetch_3b_raw + fetch_3b_report +
// credit_analysis all used to fetch the identical report independently).
// email/password login stays as a fallback for callers without a raw
// report in hand.
//
// Deploy with `supabase functions deploy fetch_3b_report`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { proxiedFetch } from "../_shared/proxy.ts";

const SMARTCREDIT_LOGIN_URL = "https://www.smartcredit.com/external-login";
const SMARTCREDIT_JSON_URL =
  "https://www.smartcredit.com/member/credit-report/3b/simple.htm?format=JSON";

// Mimics a real browser request — same reasoning as fetch_3b_raw.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36";

const headers = new Headers({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Only POST allowed" }), {
      status: 405,
      headers,
    });
  }

  const { email, password, rawReport } = await req.json();
  if (!rawReport && (!email || !password)) {
    return new Response(JSON.stringify({ error: "Missing email or password" }), {
      status: 400,
      headers,
    });
  }

  try {
    let report: any;

    if (rawReport) {
      // Already-fetched raw report handed to us — skip the login+fetch.
      report = rawReport;
    } else {
      // ---- Login — routed through the static-IP proxy (see
      // ../_shared/proxy.ts) so ConsumerDirect's whitelist actually covers
      // where this request comes from.
      const loginRes = await proxiedFetch(SMARTCREDIT_LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": BROWSER_USER_AGENT,
        },
        body: new URLSearchParams({
          loginType: "PARTNER_API",
          j_username: email,
          j_password: password,
        }),
      });

      // Read as text first, not .json() directly — a Cloudflare challenge
      // page (or any non-JSON response) would otherwise throw here and get
      // swallowed by the outer catch as an undiagnosable generic 500. Same
      // fix already applied in fetch_3b_raw.
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
        return new Response(
          JSON.stringify({
            error: "Login failed",
            loginStatus: loginRes.status,
            smartCreditResponse: loginBody,
          }),
          { status: 401, headers },
        );
      }

      const setCookie = loginRes.headers.get("set-cookie");
      if (!setCookie) {
        return new Response(JSON.stringify({ error: "No session cookie returned" }), {
          status: 500,
          headers,
        });
      }
      const jsessionMatch = setCookie.match(/JSESSIONID=[^;]+/);
      if (!jsessionMatch) {
        return new Response(JSON.stringify({ error: "No JSESSIONID found" }), {
          status: 500,
          headers,
        });
      }
      const jsessionId = jsessionMatch[0];

      // ---- Fetch report — same proxy, same reasoning.
      const reportRes = await proxiedFetch(SMARTCREDIT_JSON_URL, {
        headers: {
          Cookie: jsessionId,
          "User-Agent": BROWSER_USER_AGENT,
        },
        redirect: "follow",
      });

      const contentType = reportRes.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        report = await reportRes.json();
      } else {
        // Extract embedded JSON from HTML
        const htmlText = await reportRes.text();
        const match = htmlText.match(/<div id="TokenDisplay">\s*(\{.*?\})\s*<\/div>/s);
        if (!match) {
          return new Response(
            JSON.stringify({
              error: "Could not extract JSON from HTML response",
              reportStatus: reportRes.status,
              htmlPreview: htmlText.slice(0, 300),
            }),
            { status: 500, headers },
          );
        }
        try {
          report = JSON.parse(match[1]);
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: "Failed to parse embedded JSON", detail: err.message }),
            { status: 500, headers },
          );
        }
      }
    }

    // ---- Helpers to normalize array-or-object shapes
    const toArray = <T>(val: T | T[] | undefined | null): T[] =>
      Array.isArray(val) ? val : val ? [val] : [];

    // ---- Normalize bundle list
    const bundleComponentsRaw =
      report?.BundleComponents?.BundleComponent ?? report?.BundleComponents ?? [];
    const bundleList = toArray(bundleComponentsRaw);

    const mergedBundle = bundleList.find((b: any) => b?.Type === "MergeCreditReports");

    // ---- Normalize tradeline partitions and inquiry partitions
    const tlPartitionsRaw = mergedBundle?.TrueLinkCreditReportType?.TradeLinePartition;
    const tradelinePartitions = toArray(tlPartitionsRaw);

    const inquiryPartitionsRaw = mergedBundle?.TrueLinkCreditReportType?.InquiryPartition;
    const inquiryPartitions = toArray(inquiryPartitionsRaw);

    // ---- Parse Accounts
    const accounts: Array<{
      creditor: string | undefined;
      type: string | undefined;
      dateOpened: string | undefined;
      openClosed: string;
    }> = [];

    for (const partition of tradelinePartitions) {
      const accountTypeAbbreviation = partition?.accountTypeAbbreviation;
      const tradelineArray = toArray(partition?.Tradeline);
      const firstTradeline = tradelineArray[0];
      if (!firstTradeline) continue;

      accounts.push({
        creditor: firstTradeline.creditorName,
        type: accountTypeAbbreviation,
        dateOpened: firstTradeline.dateOpened,
        openClosed: firstTradeline.OpenClosed?.description || "",
      });
    }

    // ---- Parse Inquiries (support Inquiry as object or array)
    const inquiriesFlat: Array<{
      date: string | undefined;
      creditor: string | undefined;
      bureau: string | undefined;
    }> = [];

    for (const ip of inquiryPartitions) {
      const inquiryArr = toArray(ip?.Inquiry);
      for (const inquiry of inquiryArr) {
        inquiriesFlat.push({
          date: inquiry?.inquiryDate,
          creditor: inquiry?.subscriberName,
          bureau: inquiry?.bureau,
        });
      }
    }

    const experian = inquiriesFlat
      .filter((i) => String(i.bureau || "").toLowerCase().includes("experian"))
      .map(({ date, creditor }) => ({ date, creditor }));

    const transunion = inquiriesFlat
      .filter((i) => String(i.bureau || "").toLowerCase().includes("transunion"))
      .map(({ date, creditor }) => ({ date, creditor }));

    const equifax = inquiriesFlat
      .filter((i) => String(i.bureau || "").toLowerCase().includes("equifax"))
      .map(({ date, creditor }) => ({ date, creditor }));

    return new Response(
      JSON.stringify({
        success: true,
        accounts,
        experian,
        transunion,
        equifax,
      }),
      { headers },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    });
  }
});
