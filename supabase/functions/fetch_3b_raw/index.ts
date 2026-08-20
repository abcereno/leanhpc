// supabase/functions/fetch_3b_raw/index.ts
//
// Logs into SmartCredit as the client (via their PARTNER_API login
// endpoint) and pulls the raw 3-bureau JSON report, saved to
// raw_credit_report.json — see Fetch3bModal.jsx's handleFetch3B, which
// calls this BEFORE credit_analysis and treats a failure here as
// non-fatal (logged, not thrown) since credit_analysis is the function
// that actually blocks the import if IT fails.
//
// Brought into the repo from the Supabase dashboard-only copy on
// 2026-08-15 while debugging a login failure that started ~1 year in —
// SmartCredit's PARTNER_API login endpoint appears to have changed
// something server-side (exact cause unconfirmed as of this commit; see
// the error-detail additions below, added specifically to answer that
// question next time this fails instead of guessing again).
//
// Deploy with `supabase functions deploy fetch_3b_raw` (or paste into the
// dashboard function editor).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { proxiedFetch } from "../_shared/proxy.ts";

const SMARTCREDIT_LOGIN_URL =
  "https://www.smartcredit.com/external-login";
const SMARTCREDIT_JSON_URL =
  "https://www.smartcredit.com/member/credit-report/3b/simple.htm?format=JSON";

// Mimics a real browser request — SmartCredit's PARTNER_API login has, at
// least historically, been picky about requests that look automated.
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
    return new Response(
      JSON.stringify({ error: "Only POST allowed" }),
      { status: 405, headers },
    );
  }

  const { email, password } = await req.json();
  if (!email || !password) {
    return new Response(
      JSON.stringify({ error: "Missing email or password" }),
      { status: 400, headers },
    );
  }

  try {
    // Step 1: Login — routed through the static-IP proxy (see
    // ../_shared/proxy.ts) so ConsumerDirect can whitelist a fixed IP for
    // this legacy external-login path.
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

    // Read as text FIRST, not .json() directly — if SmartCredit's login
    // endpoint now returns something other than JSON (e.g. it reverted to
    // serving an HTML login/error page for this login type), the old code
    // would throw here and get swallowed by the outer catch as a generic
    // "err.message" 500 with zero detail. Parsing manually lets us report
    // exactly what came back either way instead of guessing.
    const loginRawText = await loginRes.text();
    let loginBody = null;
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
      // Previously just "Login failed" with nothing else — that's what
      // made this undiagnosable without seeing the source. Now returns
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

    const setCookie = loginRes.headers.get("set-cookie");
    if (!setCookie) {
      return new Response(
        JSON.stringify({ error: "No session cookie returned" }),
        { status: 500, headers },
      );
    }

    const jsessionMatch = setCookie.match(/JSESSIONID=[^;]+/);
    if (!jsessionMatch) {
      return new Response(
        JSON.stringify({ error: "JSESSIONID not found in set-cookie header" }),
        { status: 500, headers },
      );
    }

    const jsessionId = jsessionMatch[0];

    // Step 2: Fetch JSON report — same proxy, same reasoning.
    const reportRes = await proxiedFetch(SMARTCREDIT_JSON_URL, {
      headers: {
        Cookie: jsessionId,
        "User-Agent": BROWSER_USER_AGENT,
      },
      redirect: "follow",
    });

    const contentType = reportRes.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const reportJson = await reportRes.json();
      return new Response(
        JSON.stringify({ success: true, report: reportJson }),
        { headers },
      );
    } else {
      const htmlText = await reportRes.text();
      const match = htmlText.match(
        /<div id="TokenDisplay">\s*(\{.*?\})\s*<\/div>/s,
      );
      if (!match) {
        return new Response(
          JSON.stringify({
            error: "Could not extract JSON from HTML response",
            reportStatus: reportRes.status,
            htmlPreview: htmlText.slice(0, 500),
          }),
          { status: 500, headers },
        );
      }

      try {
        const embeddedJson = JSON.parse(match[1]);
        return new Response(
          JSON.stringify({ success: true, report: embeddedJson }),
          { headers },
        );
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Failed to parse embedded JSON",
            detail: err.message,
          }),
          { status: 500, headers },
        );
      }
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers },
    );
  }
});
