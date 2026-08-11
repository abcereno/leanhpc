// supabase/functions/generate-letter-content/index.ts
//
// In-house dispute-letter generation (replaces the Google Docs + Apps
// Script webhook flow for the admin "Standard Letters" button only — see
// useInquiriesThread.js#generateDisputeLetters, which is left completely
// untouched; this is a separate, additional flow). Reuses the same
// OPENAI_KEY secret as classify-inquiries/validate-document — no new key
// needed.
//
// Real sample letters (3 bureau cover letters, reviewed directly with the
// client) showed the same underlying legal content — "I did not authorize
// these inquiries", FCRA Section 604 (15 U.S.C. §1681b) permissible-
// purpose language, and a request for documented proof/signed
// authorization — but worded DIFFERENTLY every time the letter was
// generated, so it never reads as an identical mail-merge template.
// That's this function's whole job: given the same inputs, produce
// fresh, non-generic phrasing on every call (temperature is
// intentionally high, unlike classify-inquiries/validate-document which
// need determinism).
//
// Per the client: the color applied to these AI-generated blocks (done
// client-side in src/utils/letterTemplate.js, not here) is functional,
// not decorative — it's the existing convention from the Google
// Docs/Apps Script letters and is left in place as-is in the in-house
// version.
//
// Input: { bureau: 'Experian'|'TransUnion'|'Equifax', clientName: string,
//          inquiries: [{ creditor: string, date: string }] }
// Output: { success: true, banner: string, paragraph1: string,
//           paragraph2: string }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { OpenAI } from 'https://esm.sh/openai@4.0.0';

const headers = new Headers({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
});

function buildPrompt(bureau: string, clientName: string, creditorNames: string[]): string {
  const creditorList = creditorNames.length ? creditorNames.join(', ') : 'the inquiries listed in this letter';

  return `You are helping a consumer write a personal, first-person dispute letter to ${bureau} about credit inquiries they did not authorize. This is one of many letters generated for different clients, so it must NOT read like a form template — use fresh, natural wording every time, never reuse stock phrasing verbatim.

The consumer's name is ${clientName}. The unauthorized inquiries are from: ${creditorList}.

Write three separate blocks of text:

1. "banner": 2-3 sentences for a cover-page notice addressed to ${bureau}, asserting that this is a real, genuine consumer contacting them directly (not a form letter from a credit repair company), that they did not authorize the inquiries listed, and requesting their removal along with documentation proving permissible purpose bearing the consumer's signature.

2. "paragraph1": 3-4 sentences, first-person, stating the consumer has no recollection of granting the listed companies (or their representatives) permission to access their credit file, and citing that under the Fair Credit Reporting Act, Section 604 (15 U.S.C. § 1681b), a permissible purpose requires the consumer's prior knowledge and consent before an inquiry can be made.

3. "paragraph2": 2-3 sentences, first-person, requesting clear evidence of permissible purpose and a signed authorization for each inquiry, and stating that if this documentation cannot be provided, the consumer insists the inquiries be promptly removed from their credit file.

Tone: professional, firm, personal — written the way an individual consumer would actually write it, not a lawyer or a template. Vary sentence structure and word choice meaningfully from any other letter — no two letters this system generates should read alike.

Respond with strict JSON only, in this exact shape:
{ "banner": "...", "paragraph1": "...", "paragraph2": "..." }`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const { bureau, clientName, inquiries } = await req.json();

    if (!bureau || typeof bureau !== 'string') throw new Error('Invalid or missing bureau');

    const openaiKey = Deno.env.get('OPENAI_KEY');
    if (!openaiKey) throw new Error('Missing OpenAI key');

    const creditorNames = Array.isArray(inquiries)
      ? [...new Set(inquiries.map((i: any) => String(i?.creditor || '').trim()).filter(Boolean))]
      : [];

    const prompt = buildPrompt(bureau, clientName || 'the consumer', creditorNames);

    const openai = new OpenAI({ apiKey: openaiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.9,
      max_tokens: 700
    });

    const responseText = completion.choices?.[0]?.message?.content;
    if (!responseText) throw new Error('No response from OpenAI');
    const parsed = JSON.parse(responseText);

    const banner = typeof parsed?.banner === 'string' ? parsed.banner.trim() : '';
    const paragraph1 = typeof parsed?.paragraph1 === 'string' ? parsed.paragraph1.trim() : '';
    const paragraph2 = typeof parsed?.paragraph2 === 'string' ? parsed.paragraph2.trim() : '';

    if (!banner || !paragraph1 || !paragraph2) throw new Error('OpenAI response was missing one or more required blocks');

    return new Response(JSON.stringify({ success: true, banner, paragraph1, paragraph2 }), { headers });
  } catch (err) {
    console.error('❌ generate-letter-content error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers });
  }
});
