// supabase/functions/inquiry-parser/index.ts
//
// Not previously tracked in this repo (lived only in the Supabase
// dashboard's function editor, like classify-inquiries.ts and
// credit_analysis/index.ts before they were brought in) — this is now the
// canonical source, so redeploy after editing
// (`supabase functions deploy inquiry-parser`, or paste into the
// dashboard function editor).
//
// Called by src/components/admin/UploadReportForm.jsx's handleParse
// (Step 2 of the manual PDF-upload flow) — one call per ~5-page OCR text
// chunk (see splitOCRByPages), extracting raw hard inquiries per bureau.
// Its output (still unclassified — `classification` is always "") is
// combined with account-parser/index.ts's output and sent to
// classify-inquiries.ts (deployed separately) to actually tag each
// inquiry linked/associated/non-linked.
//
// Note: when this was pasted in for review, both this file and
// account-parser/index.ts had the identical header comment
// "// account-parser edge function" — only this one returns
// `{ experian, transunion, equifax }` (what UploadReportForm.jsx's
// inquiry-parser call expects); the other extracts open accounts and
// belongs at account-parser/index.ts. Comment corrected here; verify in
// the Supabase dashboard that the function *slugs* were never actually
// swapped.
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
You are a credit report parser.

Extract **only the hard inquiries** from the SmartCredit report section below.

Each inquiry follows this format:
**"[Creditor Name] [Date of Inquiry] [Credit Bureau]"**

📌 For each valid line, extract:
- "date": fix malformed or jammed dates, and ensure final format is **MM/DD/YYYY**
  - If the date appears to be in **DD/MM/YYYY**, convert it to **MM/DD/YYYY**
  - Example: 23/04/2025 → 04/23/2025; 7112/2024 → 07/12/2024
- "creditor": FULL NAME in **ALL CAPS** (normalize if partially cut off)
- "bureau": convert to lowercase: one of **"experian"**, **"transunion"**, or **"equifax"**
- "classification": leave as an empty string: ""

📎 Additional rules:
- ✅ Only include lines that match the pattern: "[Creditor Name] [Date] [Bureau]"
- ✅ Fix jammed dates (e.g., 7112/2024 → 07/12/2024, 122024 → 01/22/2024 if logical)
- ❌ Exclude lines with unreadable or missing dates
- ❌ Exclude inquiries with unknown bureau names (must be Experian, TransUnion, Equifax)
- ✅ include duplicates
- Creditor names may include unusual formats or characters, such as slashes (e.g., "RC/WILLEY", "SYNCB/PAYPAL"). These are still valid creditor names and should not be skipped.

Return ONLY valid JSON in the following format:
{
  "experian": [
    { "date": "MM/DD/YYYY", "creditor": "NAME"}
  ],
  "transunion": [ ... ],
  "equifax": [ ... ]
}

Now parse the following report text:
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
      ...parsed
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
