// supabase/functions/account-parser/index.ts
//
// Not previously tracked in this repo (lived only in the Supabase
// dashboard's function editor, like classify-inquiries.ts and
// credit_analysis/index.ts before they were brought in) — this is now the
// canonical source, so redeploy after editing
// (`supabase functions deploy account-parser`, or paste into the
// dashboard function editor).
//
// Called by src/components/admin/UploadReportForm.jsx's handleParse
// (Step 2 of the manual PDF-upload flow) — one call per ~5-page OCR text
// chunk (see splitOCRByPages), extracting only open accounts. Its output
// feeds classify-inquiries.ts (deployed separately) as the `accounts`
// array that inquiry linking is checked against.
//
// Note: when this was pasted in for review, both this file and
// inquiry-parser/index.ts had the identical header comment
// "// account-parser edge function" — only this one actually returns
// `{ accounts }` (what UploadReportForm.jsx's account-parser call expects
// via `accountJson.accounts`); the other extracts inquiries and belongs at
// inquiry-parser/index.ts. Comment corrected here; verify in the Supabase
// dashboard that the function *slugs* were never actually swapped, since
// that would break Step 2 on the very first chunk
// (`allAccounts.push(...accountJson.accounts)` spreading `undefined`).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { OpenAI } from "https://esm.sh/openai@4.0.0";
const headers = new Headers({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
});
serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response(null, {
    headers
  });
  if (req.method !== "POST") return new Response(JSON.stringify({
    error: "Method not allowed"
  }), {
    status: 405,
    headers
  });
  try {
    const { text } = await req.json();
    if (!text || text.length < 100) throw new Error("Invalid or missing text.");
    const openaiKey = Deno.env.get("OPENAI_KEY");
    if (!openaiKey) throw new Error("Missing OpenAI key in environment.");
    const openai = new OpenAI({
      apiKey: openaiKey
    });
    const prompt = `
Extract only valid OPEN credit accounts from the input credit report text. Return each as an object with:

- creditor: ALL CAPS version of the lender's name (do not guess or generalize)
- type: one of [revolving, installment, mortgage]
- dateOpened: taken ONLY from **TransUnion**, fixed to **MM/DD/YYYY**

Strict rules:

1. ✅ Only include accounts marked **Open** in **TransUnion**.
2. ✅ Use the **TransUnion-reported dateOpened**. If missing or unreadable, but the account is clearly marked “Open” and has a valid open date in Experian or Equifax, use Experian or Equifax' date instead.
3. ✅ Allow duplicate accounts (do not merge even if names are similar).
4. ✅ Accept creditor names with slashes or unique formats (e.g., WCC/STRIDE BK/VERVENT).
5. ❌ Do NOT extract fake or generic creditor labels such as:
   - SAVINGS AND LOAN COMPANIES
   - AUTO FINANCING
   - PERSONAL LOAN COMPANIES
   - ALL BANKS
   - COMMERCIAL BANKS
6. ✅ Fix date formatting issues:
   - Malformed dates like "7112/2024" → "07/12/2024"
   - Detect and convert **DD/MM/YYYY** to **MM/DD/YYYY** if needed (e.g., 23/04/2025 → 04/23/2025)
   - Final format must be: **MM/DD/YYYY**
7. If an account appears under a section labeled “Other” or has a non-standard category label (e.g., Personal Loan Companies), still include it if:
   - The TransUnion section shows "Account Status: Open"
   - There is a valid "Account Type" such as "Credit Card", "Auto Loan", "Mortgage", or other known types
   - The account meets all other criteria (valid creditor name, readable open date, etc.)


Only include accounts that meet **all criteria** above.

Output ONLY valid JSON in this format:
{
  "accounts": [
    { "dateOpened": "MM/DD/YYYY", "creditor": "NAME", "type": "installment" }
  ]
}

Now parse the following:
${text}
`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: {
        type: "json_object"
      },
      temperature: 0.1,
      max_tokens: 4000
    });
    const result = completion.choices?.[0]?.message?.content;
    if (!result) throw new Error("No content returned from OpenAI");
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch  {
      throw new Error("Invalid JSON returned from OpenAI");
    }
    return new Response(JSON.stringify({
      success: true,
      accounts: parsed.accounts
    }), {
      headers
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers
    });
  }
});
