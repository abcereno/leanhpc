// supabase/functions/validate-document/index.ts
//
// AI validity check for identity documents uploaded via two different
// upload widgets that share this one Edge Function:
//   - CoverLetterAssets.jsx (admin) — legacy fixed 3-type system, sends
//     `docType: 'license' | 'ssn' | 'poa'`. UNCHANGED by the LTOS work
//     below — see buildPrompt()/DOC_TYPE_LABELS.
//   - CoverLetterAssetsLTOS.jsx (company portal + public intake) — LTOS
//     Document Requirements system, sends `category: 'identity' |
//     'address' | 'authorization'` instead of a fixed docType, since each
//     category accepts several alternative document types (e.g. Proof of
//     Address = utility bill OR bank statement OR lease OR ...). The AI
//     auto-detects which specific type it's looking at (`detectedType`)
//     and applies that type's rules — see CATEGORY_TYPES/
//     buildCategoryPrompt(). Exactly one of docType/category is sent per
//     request; never both.
// Reuses the same OPENAI_KEY secret as classify-inquiries — no new key
// needed. Unlike classify-inquiries (plain text/JSON), this call sends an
// image to a vision-capable model, since the whole point is looking at
// the actual document.
//
// Not previously tracked anywhere — canonical source lives here, deploy
// with `supabase functions deploy validate-document` (or paste into the
// dashboard function editor). Companion migration:
// sql/add_document_validation.sql.
//
// Input: { docType?: 'license'|'ssn'|'poa', category?: 'identity'|'address'|'authorization',
//          imageDataUrl: string, clientName?: string, clientAddress?: string,
//          today?: string (YYYY-MM-DD, defaults to the function's own clock) }
// imageDataUrl is always a base64 data: URL, never a Supabase signed
// storage URL — the caller (src/utils/validateDocument.js) always
// resolves the file to a data URL first (rendering page 1 to an image
// for PDFs, reusing the same pdfjs-dist pattern already used for OCR in
// UploadReportForm.jsx) so this function never depends on being able to
// reach Supabase Storage over the network itself.
//
// Output: { success: true, status: 'valid'|'expired'|'invalid'|'needs_review',
//           confidence: number (0-1), expiresAt: 'YYYY-MM-DD'|null,
//           reasoning: string, detectedType: string|null }
// detectedType is only populated for category-based (LTOS) requests —
// null for legacy docType requests, which never had this concept.
//
// Warning-only by design (per product decision) — nothing downstream
// reads this as a hard gate; see CoverLetterAssets.jsx / CoverLetterAssetsLTOS.jsx's
// badge-only integration. A model misread of a phone-camera photo should
// never silently block a client. Name/address mismatches are reported in
// `reasoning` the same way — they never force an "invalid" status on
// their own (product decision, same warning-only precedent).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { OpenAI } from 'https://esm.sh/openai@4.0.0';

const headers = new Headers({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
});

const VALID_STATUSES = ['valid', 'expired', 'invalid', 'needs_review'];

const DOC_TYPE_LABELS: Record<string, string> = {
  license: "a government-issued driver's license or state photo ID",
  ssn: 'a Social Security card',
  poa: 'a proof-of-address document (utility bill, bank/financial statement, or similar)'
};

// POA freshness window — product decision: 60 days. License expiration
// uses the actual printed expiration date, not this window.
const POA_MAX_AGE_DAYS = 60;

function buildPrompt(docType: string, clientName: string | undefined, today: string): string {
  const label = DOC_TYPE_LABELS[docType] || 'an identity document';
  const nameNote = clientName
    ? `The client's name on file is "${clientName}" — note in your reasoning whether the name on the document appears to match, but do not fail validity solely over a minor spelling/formatting difference (e.g. middle initial, suffix).`
    : '';

  const typeSpecificRules =
    docType === 'license'
      ? `- US driver's licenses/state IDs print TWO dates close together and easy to mix up: an issue date (labeled "ISS" or "ISD", sometimes numbered field 4a) and an expiration date (labeled "EXP", sometimes numbered field 4b). These are DIFFERENT dates — the issue date is always in the past and never means the document has expired. Only the "EXP" date matters for this check.
- Extract the expiration date printed on the ID — the one labeled "EXP", not "ISS"/"ISD". The expiration date is always later than the issue date; if the date you're about to call "expiration" is actually earlier than the issue date on the same card, you have the two fields backwards — re-read the card and use the correct one.
- Also extract the issue date if visible, so it can be cross-checked.
- Today's date is ${today}. If the (correctly identified) expiration date is before today, status must be "expired".
- If the image is not actually a license/state ID, or is too illegible to read the expiration date, status must be "invalid" (not readable at all) or "needs_review" (readable but you're not fully confident).
- Otherwise, if it's clearly a valid, unexpired license, status is "valid".`
      : docType === 'poa'
      ? `- Extract the statement/bill/issue date printed on the document (the date the document itself was generated, not a due date).
- Today's date is ${today}. If that date is more than ${POA_MAX_AGE_DAYS} days before today, status must be "expired" (too old to serve as current proof of address).
- The document must show a name and a mailing address to qualify as proof of address at all. If it doesn't, or isn't a real utility bill/bank statement/similar, status must be "invalid".
- If you can't confidently read the date or the document type, status must be "needs_review".
- Otherwise, if it's a valid, recent proof-of-address document, status is "valid".`
      : `- Confirm this is genuinely a Social Security card (not some other ID). SSN cards do not expire, so no date check applies.
- If the image is clearly not an SSN card, status must be "invalid". If it's illegible or you're not confident, status must be "needs_review".
- Otherwise, if it's clearly a legible, genuine SSN card, status is "valid".`;

  return `You are reviewing an uploaded image that is supposed to be ${label}.

${typeSpecificRules}
${nameNote}

Respond with strict JSON only, in this exact shape:
{
  "status": "valid" | "expired" | "invalid" | "needs_review",
  "confidence": <number between 0 and 1>,
  "expiresAt": "YYYY-MM-DD" or null (the expiration date for a license, or the statement date for a POA document — null for SSN or if no date could be read),
  "issuedAt": "YYYY-MM-DD" or null (the issue date, ONLY for a license — helps cross-check you didn't mix it up with the expiration date; null otherwise),
  "reasoning": "<one or two sentences explaining the decision, including what you read on the document>"
}

Be conservative: if you are not confident, use "needs_review" rather than guessing "valid" or "invalid". A missed problem is worse than flagging something a human can quickly double-check.`;
}

// --- LTOS category-based system (CoverLetterAssetsLTOS.jsx) ------------
//
// Each category accepts several alternative document types — the model
// picks which one it's looking at (detectedType) and this function's
// caller stores that alongside the category slot, rather than the
// uploader having to pre-select a type themselves (product decision:
// AI auto-detects rather than a dropdown).
const CATEGORY_TYPES: Record<string, Record<string, string>> = {
  identity: {
    driver_license: "a driver's license",
    state_id: "a state-issued photo ID card",
    passport: "a passport",
  },
  address: {
    utility_bill: "a utility bill",
    bank_statement: "a bank statement",
    mortgage_statement: "a mortgage statement",
    lease_agreement: "a lease agreement",
    property_deed: "a property deed",
    insurance_statement: "an insurance statement",
    government_mail: "official government mail (e.g. IRS, DMV, or similar)",
  },
  authorization: {
    limited_poa: "a signed Limited Power of Attorney",
  },
};

// Freshness window for address-proof document types that carry a
// statement/issue date — same 60-day product decision the legacy 'poa'
// docType has always used. Static documents (lease, deed) are exempted
// below since they don't have a recurring "statement date" the way a
// utility bill does.
const ADDRESS_MAX_AGE_DAYS = 60;

function buildCategoryPrompt(
  category: string,
  clientName: string | undefined,
  clientAddress: string | undefined,
  today: string
): string {
  const typeMap = CATEGORY_TYPES[category];
  const typeList = Object.entries(typeMap)
    .map(([slug, label]) => `- "${slug}": ${label}`)
    .join('\n');

  const nameNote = clientName
    ? `The client's name on file is "${clientName}" — note in your reasoning whether the name on the document appears to match, but do not fail validity solely over a minor spelling/formatting difference (e.g. middle initial, suffix).`
    : '';

  const addressNote = category === 'address' && clientAddress
    ? `The client's current address on file is "${clientAddress}" — note in your reasoning whether the address on the document appears to match (minor formatting differences like abbreviations or unit-number placement are fine), but do not fail validity solely over a minor formatting difference. If the address on the document clearly does not match at all, say so plainly in your reasoning.`
    : '';

  let categoryRules: string;
  if (category === 'identity') {
    categoryRules = `This document should be one of the following forms of photo identification:
${typeList}

- First determine which of the above it is (set "detectedType" to the matching key, or "unknown" if you can't tell or it's none of these).
- Driver's licenses/state IDs print TWO dates close together and easy to mix up: an issue date (labeled "ISS" or "ISD", sometimes field 4a) and an expiration date (labeled "EXP", sometimes field 4b). These are DIFFERENT dates — the issue date is always in the past and never means the document has expired. Only the "EXP" date matters here.
- Extract the expiration date printed on the document — the one labeled "EXP", not "ISS"/"ISD". It's always later than the issue date; if the date you're about to call "expiration" is earlier than the issue date on the same document, you have the two fields backwards — re-read it and use the correct one. (Passports print only one expiration date, no issue-date mix-up risk there.)
- Also extract the issue date if visible (licenses/state IDs only), so it can be cross-checked.
- Today's date is ${today}. If the (correctly identified) expiration date is before today, status must be "expired" — photo ID must be current, never expired.
- If the image is not actually one of the listed identity documents, or is too illegible to read, status must be "invalid" (not readable / wrong document) or "needs_review" (readable but you're not fully confident).
- Otherwise, if it's clearly a valid, unexpired document from the list, status is "valid".`;
  } else if (category === 'address') {
    categoryRules = `This document should be one of the following proof-of-address documents:
${typeList}

- First determine which of the above it is (set "detectedType" to the matching key, or "unknown" if you can't tell or it's none of these).
- The document must show a name and a mailing address to qualify as proof of address at all. If it doesn't, or isn't genuinely one of the listed document types, status must be "invalid".
- For "utility_bill", "bank_statement", "mortgage_statement", "insurance_statement", or "government_mail": extract the statement/issue date printed on the document. Today's date is ${today}. If that date is more than ${ADDRESS_MAX_AGE_DAYS} days before today, status must be "expired" (too old to serve as current proof of address).
- For "lease_agreement": these don't need to be recently issued, but if the lease shows an end date that has already passed as of ${today}, status must be "expired". Otherwise judge only on legibility and whether the address matches.
- For "property_deed": deeds don't expire — judge only on legibility, genuineness, and whether the address matches. Never mark a legible, genuine deed as "expired" purely for being old.
- If you can't confidently read the date or the document type, status must be "needs_review".
- Otherwise, if it's a valid, current proof-of-address document, status is "valid".`;
  } else {
    categoryRules = `This document should be:
${typeList}

- Set "detectedType" to "limited_poa" if it's clearly a Limited Power of Attorney document, or "unknown" if it isn't.
- It must be SIGNED to be valid — if no signature is visible anywhere on the document, status must be "invalid" and your reasoning must say it's unsigned.
- If the document itself states an expiration or validity end date and that date is before ${today}, status must be "expired".
- If illegible or you're not confident, status must be "needs_review".
- Otherwise, if it's a valid, signed Limited Power of Attorney, status is "valid".`;
  }

  return `You are reviewing an uploaded document image.

${categoryRules}
${nameNote}
${addressNote}

Respond with strict JSON only, in this exact shape:
{
  "detectedType": ${Object.keys(typeMap).map((k) => `"${k}"`).join(' | ')} | "unknown",
  "status": "valid" | "expired" | "invalid" | "needs_review",
  "confidence": <number between 0 and 1>,
  "expiresAt": "YYYY-MM-DD" or null (expiration/end date if one applies and was read, otherwise null),
  "issuedAt": "YYYY-MM-DD" or null (issue date, ONLY for identity documents — helps cross-check you didn't mix it up with the expiration date; null otherwise),
  "reasoning": "<one or two sentences explaining the decision, including what you read on the document and noting any name or address mismatch>"
}

Be conservative: if you are not confident, use "needs_review" rather than guessing "valid" or "invalid". A missed problem is worse than flagging something a human can quickly double-check. The document must be clear and legible to be marked "valid" — if the image is blurry, cropped, or unreadable, do not mark it "valid".`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const { docType, category, imageDataUrl, clientName, clientAddress, today } = await req.json();

    // Exactly one of docType (legacy, admin CoverLetterAssets.jsx) or
    // category (LTOS, CoverLetterAssetsLTOS.jsx) is expected — never
    // both, never neither.
    const isCategoryRequest = !docType && !!category;
    if (!isCategoryRequest && (!docType || !DOC_TYPE_LABELS[docType])) {
      throw new Error(`Invalid or missing docType (expected one of: ${Object.keys(DOC_TYPE_LABELS).join(', ')})`);
    }
    if (isCategoryRequest && !CATEGORY_TYPES[category]) {
      throw new Error(`Invalid category (expected one of: ${Object.keys(CATEGORY_TYPES).join(', ')})`);
    }
    if (!imageDataUrl || typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:')) {
      throw new Error('Invalid or missing imageDataUrl (must be a base64 data: URL)');
    }

    const openaiKey = Deno.env.get('OPENAI_KEY');
    if (!openaiKey) throw new Error('Missing OpenAI key');

    const effectiveToday = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : new Date().toISOString().slice(0, 10);
    const prompt = isCategoryRequest
      ? buildCategoryPrompt(category, clientName, clientAddress, effectiveToday)
      : buildPrompt(docType, clientName, effectiveToday);

    const openai = new OpenAI({ apiKey: openaiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl } }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 500
    });

    const responseText = completion.choices?.[0]?.message?.content;
    if (!responseText) throw new Error('No response from OpenAI');
    const parsed = JSON.parse(responseText);

    let status = VALID_STATUSES.includes(parsed?.status) ? parsed.status : 'needs_review';
    const confidence = typeof parsed?.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : null;
    const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(parsed?.expiresAt || '') ? parsed.expiresAt : null;
    const issuedAt = /^\d{4}-\d{2}-\d{2}$/.test(parsed?.issuedAt || '') ? parsed.issuedAt : null;
    let reasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning : '';
    const detectedType = isCategoryRequest
      ? (typeof parsed?.detectedType === 'string' && (CATEGORY_TYPES[category][parsed.detectedType] || parsed.detectedType === 'unknown')
          ? parsed.detectedType
          : 'unknown')
      : null;

    // Deterministic backstop for the ISS/EXP mix-up — an ID's expiration
    // date is always after its issue date, so if the model reported an
    // expiresAt that's on or before the issuedAt it also reported, it
    // almost certainly read the wrong field off the card (this is exactly
    // what caused a valid, years-from-expiring license to get flagged
    // "expired"). Catching this in code rather than only via prompt
    // wording means it still works even if the model doesn't fully follow
    // that instruction. Downgrades to "needs_review" instead of silently
    // flipping to "valid" — still surfaces for a human to double-check
    // rather than guessing which date is actually correct.
    if (expiresAt && issuedAt && expiresAt <= issuedAt && (docType === 'license' || category === 'identity')) {
      status = 'needs_review';
      reasoning = `${reasoning} [Auto-flagged: the extracted expiration date (${expiresAt}) is not after the extracted issue date (${issuedAt}) — likely read the wrong date field (ISS vs EXP). Please verify manually.]`.trim();
    }

    return new Response(
      JSON.stringify({ success: true, status, confidence, expiresAt, issuedAt, reasoning, detectedType }),
      { headers }
    );
  } catch (err) {
    console.error('❌ validate-document error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers });
  }
});
