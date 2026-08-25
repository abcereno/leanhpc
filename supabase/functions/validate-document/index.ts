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
//          reportCheck?: 'ftc', imageDataUrl: string, clientName?: string,
//          clientAddress?: string, clientSsn?: string, clientEmail?: string,
//          clientPhone?: string, clientDob?: string (YYYY-MM-DD, same
//          format as clients.dob), today?: string (YYYY-MM-DD, defaults to
//          the function's own clock) }
// imageDataUrl is always a base64 data: URL, never a Supabase signed
// storage URL — the caller (src/utils/validateDocument.js) always
// resolves the file to a data URL first (rendering page 1 to an image
// for PDFs, reusing the same pdfjs-dist pattern already used for OCR in
// UploadReportForm.jsx) so this function never depends on being able to
// reach Supabase Storage over the network itself.
//
// Output: { success: true, status: 'valid'|'expired'|'invalid'|'needs_review',
//           confidence: number (0-1), expiresAt: 'YYYY-MM-DD'|null,
//           reasoning: string, detectedType: string|null, checks: object|null }
// detectedType is only populated for category-based (LTOS) requests —
// null for legacy docType requests, which never had this concept.
// `checks` holds the structured alignment-check results (see above) —
// shape depends on request type: docType/category requests get
// {ssnMatch, nameMatch, addressMatch, dobMatch} (each true/false/null —
// null means "not applicable to this doc type" or "nothing to compare
// against was provided") PLUS the raw {extractedName, extractedAddress,
// extractedSsn, extractedDob} each doc type actually reads (null for
// fields that doc type doesn't extract), so a caller can show what the AI
// read verbatim, not just a match badge. A license (docType) or
// driver_license/state_id (category:'identity') extracts and checks name
// + DOB + address; an SSN card extracts/checks name + SSN; a POA
// document (or category:'address') extracts/checks name + address; a
// passport (category:'identity', detectedType:'passport') extracts/checks
// name + DOB only (no address — passports don't print a mailing address).
// reportCheck:'ftc' requests get {reportNumber, reportNumberValid,
// reportDate, hasHeaderFooter, nameMatch, emailMatch, phoneMatch}. null on
// any response where nothing was checked.
//
// Warning-only by design (per product decision) — nothing downstream
// reads this as a hard gate; see CoverLetterAssets.jsx / CoverLetterAssetsLTOS.jsx's
// badge-only integration. A model misread of a phone-camera photo should
// never silently block a client. Name/address/SSN/email/phone mismatches
// are reported via the structured `checks` object (see below) the same
// way — they never force an "invalid" status on their own (product
// decision, same warning-only precedent).
//
// --- ALIGNMENT CHECK (added 2026-08-18) ------------------------------
// Cross-references what's printed on a document against the client
// record on file, instead of leaving that judgment to a sentence buried
// in `reasoning`. Every extraction below is done BLIND — the model is
// never told what name/address/SSN/email/phone it's supposed to find, it
// only reads what's on the document — and the actual match/no-match
// comparison happens deterministically in this function afterward (see
// namesLikelyMatch/addressesLikelyMatch/etc. below), never left to the
// model's own "does this match" judgment. Same reasoning as the
// ISS-vs-EXP and expired-vs-valid deterministic backstops further down:
// an LLM asked to both extract AND judge in one step is exactly how a
// contaminated/rubber-stamped "yes it matches" slips through — extraction
// and comparison are kept as two separate steps on purpose.
//
// Third request mode added alongside docType/category: `reportCheck:
// 'ftc'` — validates an FTC Identity Theft Report specifically (report
// number format, date, header/footer presence, name/email/phone match).
// Exactly one of docType/category/reportCheck is expected per request.
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
  poa: 'a proof-of-address document (utility bill, bank/financial statement, or similar)',
  // Added for the Alignment Check — a generated dispute letter
  // (LetterEditorModal.jsx). No expiration/freshness rule (letters don't
  // expire); this exists purely so the name/address printed in the letter
  // can be blind-extracted and compared against the client record, the
  // same as every other doc type here.
  letter: 'a dispute/cover letter addressed to a credit bureau'
};

// POA freshness window — product decision: 60 days. License expiration
// uses the actual printed expiration date, not this window.
const POA_MAX_AGE_DAYS = 60;

// --- ALIGNMENT CHECK: deterministic comparison helpers ------------------
// All of these take whatever the model extracted (blind — see the header
// comment) and whatever's on file, and decide match/no-match in code.
// Returns null (not false) when either side is missing, so the UI can
// tell "checked, doesn't match" apart from "nothing to check against".

function ssnsMatch(extracted: string | null, onFile: string | null): boolean | null {
  const a = (extracted || '').replace(/\D/g, '');
  const b = (onFile || '').replace(/\D/g, '');
  if (a.length !== 9 || b.length !== 9) return null;
  return a === b;
}

// Both sides are expected as "YYYY-MM-DD" — extractedDob is asked for in
// that exact format (see buildPrompt/buildCategoryPrompt), and
// clients.dob is stored the same way (a `type="date"` form field). A
// straight string comparison is safe as long as both actually parsed as
// real dates; guards against a stray non-date string on either side
// rather than trusting the format blindly.
function dobsMatch(extracted: string | null, onFile: string | null): boolean | null {
  const validDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!validDate(extracted) || !validDate(onFile)) return null;
  return extracted === onFile;
}

function emailsMatch(extracted: string | null, onFile: string | null): boolean | null {
  const a = (extracted || '').trim().toLowerCase();
  const b = (onFile || '').trim().toLowerCase();
  if (!a || !b) return null;
  return a === b;
}

function phonesMatch(extracted: string | null, onFile: string | null): boolean | null {
  const a = (extracted || '').replace(/\D/g, '').slice(-10);
  const b = (onFile || '').replace(/\D/g, '').slice(-10);
  if (a.length !== 10 || b.length !== 10) return null;
  return a === b;
}

function nameTokens(name: string): string[] {
  return (name || '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 1); // drop lone initials — too easy to false-match
}

// Names extracted via OCR/vision rarely come back byte-identical to what's
// typed on file (middle names, suffixes, formatting) — an exact-string
// check would flag almost everything as a mismatch. Instead: match if the
// last token (surname, the most reliable part of a US name) is identical
// AND at least one other token overlaps. Not perfect, but far more honest
// than trusting the model's own "looks like a match" prose.
function namesLikelyMatch(extracted: string | null, onFile: string | null): boolean | null {
  const a = nameTokens(extracted || '');
  const b = nameTokens(onFile || '');
  if (a.length === 0 || b.length === 0) return null;

  const aLast = a[a.length - 1];
  const bLast = b[b.length - 1];
  if (aLast !== bLast) return false;

  const aRest = new Set(a.slice(0, -1));
  const bRest = b.slice(0, -1);
  if (bRest.length === 0) return true; // only a surname on file — surname match is all we can check
  return bRest.some((t) => aRest.has(t));
}

function addressTokens(address: string): string[] {
  return (address || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Same token-overlap approach as names — full-string address matching
// fails constantly over abbreviations (ST vs STREET), unit formatting, and
// OCR noise. Requires the street number (if the on-file address has one)
// to match exactly, plus at least half of the remaining on-file tokens to
// show up somewhere in the extracted address.
function addressesLikelyMatch(extracted: string | null, onFile: string | null): boolean | null {
  const a = addressTokens(extracted || '');
  const b = addressTokens(onFile || '');
  if (a.length === 0 || b.length === 0) return null;

  const bNumber = b.find((t) => /^\d+$/.test(t));
  if (bNumber && !a.includes(bNumber)) return false;

  const bRest = b.filter((t) => t !== bNumber);
  if (bRest.length === 0) return true;
  const aSet = new Set(a);
  const overlap = bRest.filter((t) => aSet.has(t)).length;
  return overlap / bRest.length >= 0.5;
}

function buildPrompt(docType: string, today: string): string {
  const label = DOC_TYPE_LABELS[docType] || 'an identity document';

  // Blind extraction — deliberately does NOT tell the model what name/
  // address/SSN it's "supposed" to find (see the ALIGNMENT CHECK header
  // comment). It just reads whatever is actually printed; the caller
  // compares that against the client record afterward in code.
  const extractionNote =
    docType === 'ssn'
      ? `Also extract the full 9-digit Social Security Number printed on the card into "extractedSsn" (digits only, no dashes — null if unreadable), and the name printed on the card into "extractedName" (null if unreadable).`
      : docType === 'poa' || docType === 'letter'
      ? `Also extract the name into "extractedName" and the full mailing address into "extractedAddress" exactly as printed on the document (null for either if unreadable).`
      : docType === 'license'
      ? `Also extract: the full name into "extractedName"; the Date of Birth (labeled "DOB" or field "3", NOT the ISS/4a or EXP/4b dates you already read above) into "extractedDob" as "YYYY-MM-DD"; and the full mailing address printed on the card into "extractedAddress" exactly as printed. Use null for any of these that are unreadable.`
      : `Also extract the full name printed on the document into "extractedName" (null if unreadable).`;

  const typeSpecificRules =
    docType === 'license'
      ? `- US driver's licenses/state IDs print numbered fields — field "4a" is ISS (issue date) and field "4b" is EXP (expiration date). These sit right next to each other and are easy to swap. You MUST use the value next to "4b" / "EXP" for expiration — NEVER the value next to "4a" / "ISS", even if it visually appears first, is printed larger, or is closer to the top of that block of text. The issue date (4a/ISS) is always in the past and never means the document has expired; it is irrelevant to whether this ID is expired.
- Locate the text label "EXP" (or "4b") specifically before reading any date. Read the date immediately next to THAT label. Do this before you look at "ISS"/"4a" at all, to avoid anchoring on the wrong field.
- Cross-check: the expiration date must always be LATER than the issue date (typically by 4-8 years for a standard license, longer for some state IDs). If the date you're about to call "expiration" is earlier than — or only a couple years after — the issue date, you very likely have the two fields swapped. Re-read the card and use the correct field.
- Extract BOTH dates: the field you determined is EXP goes in "expiresAt", and the field you determined is ISS goes in "issuedAt". Do not leave "issuedAt" blank if it's printed on the card — it's required for a license so this can be double-checked.
- Read every digit of each date individually rather than pattern-matching the whole number at once — printed digits like 3/8, 0/6/8/9, and 1/7 are easy to confuse at a glance, especially in the year. If any single digit is blurry, glared, or you're not fully certain of it, treat the date as unreadable for that digit rather than guessing — use "needs_review" instead of a confident but possibly wrong date.
- Today's date is ${today}. If the (correctly identified, field-4b) expiration date is before today, status must be "expired".
- If the image is not actually a license/state ID, or is too illegible to read the expiration date, status must be "invalid" (not readable at all) or "needs_review" (readable but you're not fully confident).
- Otherwise, if it's clearly a valid, unexpired license, status is "valid".`
      : docType === 'poa'
      ? `- Extract the statement/bill/issue date printed on the document (the date the document itself was generated, not a due date).
- Today's date is ${today}. If that date is more than ${POA_MAX_AGE_DAYS} days before today, status must be "expired" (too old to serve as current proof of address).
- The document must show a name and a mailing address to qualify as proof of address at all. If it doesn't, or isn't a real utility bill/bank statement/similar, status must be "invalid".
- If you can't confidently read the date or the document type, status must be "needs_review".
- Otherwise, if it's a valid, recent proof-of-address document, status is "valid".`
      : docType === 'letter'
      ? `- Confirm this is genuinely a dispute/cover letter addressed to a credit bureau (not some other document). Letters don't expire, so no date/freshness check applies — never use "expired" for this doc type.
- If illegible or clearly not a letter, status must be "invalid" (wrong document) or "needs_review" (readable but not confident).
- Otherwise, if it's a legible dispute letter, status is "valid".`
      : `- Confirm this is genuinely a Social Security card (not some other ID). SSN cards do not expire, so no date check applies.
- SSN cards are small, plain, and easy to photograph poorly (glare, tilted angle, partial finger covering a digit, slight blur) — none of that alone makes it "invalid". Judge the DOCUMENT TYPE and whether the name is legible, not photo quality. A card that's readable enough to confirm it's an SSN card and read the name should be "valid" even if the photo isn't perfectly crisp.
- Only use "invalid" when the image is clearly a DIFFERENT kind of document entirely (a license, a blank/random photo, something unrelated) — not for a genuine SSN card that's merely a mediocre phone photo.
- If you can tell it's an SSN card but genuinely cannot read the name or confirm it's legitimate (heavy glare over the whole card, extreme blur, etc.), use "needs_review" instead of "invalid" — that's the "readable but not confident" case, distinct from "wrong document".
- Otherwise, if it's clearly a legible, genuine SSN card, status is "valid".`;

  return `You are reviewing an uploaded image that is supposed to be ${label}.

${typeSpecificRules}
${extractionNote}

Respond with strict JSON only, in this exact shape:
{
  "status": "valid" | "expired" | "invalid" | "needs_review",
  "confidence": <number between 0 and 1>,
  "expiresAt": "YYYY-MM-DD" or null (the expiration date for a license, or the statement date for a POA document — null for SSN or if no date could be read),
  "issuedAt": "YYYY-MM-DD" or null (the issue date, ONLY for a license — helps cross-check you didn't mix it up with the expiration date; null otherwise),
  "extractedName": "<name exactly as printed>" or null,
  "extractedAddress": "<address exactly as printed, POA or license only>" or null,
  "extractedSsn": "<9 digits, no dashes, SSN card only>" or null,
  "extractedDob": "YYYY-MM-DD" or null (Date of Birth, license only — do NOT confuse with issuedAt/expiresAt above),
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

function buildCategoryPrompt(category: string, today: string): string {
  const typeMap = CATEGORY_TYPES[category];
  const typeList = Object.entries(typeMap)
    .map(([slug, label]) => `- "${slug}": ${label}`)
    .join('\n');

  // Blind extraction (see ALIGNMENT CHECK header comment) — the model
  // isn't told the expected name/address, it just reads what's printed;
  // the caller compares against the client record afterward in code.
  const extractionNote =
    category === 'address'
      ? `Also extract the name into "extractedName" and the full mailing address into "extractedAddress" exactly as printed on the document (null for either if unreadable).`
      : category === 'identity'
      ? `Also extract: the full name into "extractedName"; the Date of Birth (labeled "DOB" — NOT the ISS/4a or EXP/4b dates, or a passport's issue/expiration dates) into "extractedDob" as "YYYY-MM-DD"; and, ONLY if this is a driver_license or state_id (NOT a passport — US passports don't print a mailing address), the full mailing address into "extractedAddress" exactly as printed. Use null for any of these that are unreadable or not applicable (always null for extractedAddress on a passport).`
      : `Also extract the full name printed on the document into "extractedName" (null if unreadable).`;

  let categoryRules: string;
  if (category === 'identity') {
    categoryRules = `This document should be one of the following forms of photo identification:
${typeList}

- First determine which of the above it is (set "detectedType" to the matching key, or "unknown" if you can't tell or it's none of these).
- Driver's licenses/state IDs print numbered fields — field "4a" is ISS (issue date) and field "4b" is EXP (expiration date). These sit right next to each other and are easy to swap. You MUST use the value next to "4b" / "EXP" for expiration — NEVER the value next to "4a" / "ISS", even if it visually appears first, is printed larger, or is closer to the top of that block of text. The issue date (4a/ISS) is always in the past and never means the document has expired; it is irrelevant to whether this ID is expired.
- Locate the text label "EXP" (or "4b") specifically before reading any date. Read the date immediately next to THAT label. Do this before you look at "ISS"/"4a" at all, to avoid anchoring on the wrong field. (Passports print only one expiration date, no issue-date mix-up risk there.)
- Cross-check (licenses/state IDs only): the expiration date must always be LATER than the issue date, typically by 4-8 years for a standard license, longer for some state IDs. If the date you're about to call "expiration" is earlier than — or only a couple years after — the issue date, you very likely have the two fields swapped. Re-read the card and use the correct field.
- Extract BOTH dates for licenses/state IDs: the field you determined is EXP goes in "expiresAt", and the field you determined is ISS goes in "issuedAt". Do not leave "issuedAt" blank if it's printed on the card — it's required so this can be double-checked. (Not applicable to passports, which don't print an issue date.)
- Read every digit of each date individually rather than pattern-matching the whole number at once — printed digits like 3/8, 0/6/8/9, and 1/7 are easy to confuse at a glance, especially in the year. If any single digit is blurry, glared, or you're not fully certain of it, treat the date as unreadable for that digit rather than guessing — use "needs_review" instead of a confident but possibly wrong date.
- Today's date is ${today}. If the (correctly identified, field-4b for licenses/state IDs) expiration date is before today, status must be "expired" — photo ID must be current, never expired.
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
${extractionNote}

Respond with strict JSON only, in this exact shape:
{
  "detectedType": ${Object.keys(typeMap).map((k) => `"${k}"`).join(' | ')} | "unknown",
  "status": "valid" | "expired" | "invalid" | "needs_review",
  "confidence": <number between 0 and 1>,
  "expiresAt": "YYYY-MM-DD" or null (expiration/end date if one applies and was read, otherwise null),
  "issuedAt": "YYYY-MM-DD" or null (issue date, ONLY for identity documents — helps cross-check you didn't mix it up with the expiration date; null otherwise),
  "extractedName": "<name exactly as printed>" or null,
  "extractedAddress": "<address exactly as printed — address category, or identity category IF driver_license/state_id, only>" or null,
  "extractedDob": "YYYY-MM-DD" or null (Date of Birth, identity category only — do NOT confuse with issuedAt/expiresAt above),
  "reasoning": "<one or two sentences explaining the decision, including what you read on the document>"
}

Be conservative: if you are not confident, use "needs_review" rather than guessing "valid" or "invalid". A missed problem is worse than flagging something a human can quickly double-check. The document must be clear and legible to be marked "valid" — if the image is blurry, cropped, or unreadable, do not mark it "valid".`;
}

// --- FTC Identity Theft Report check ------------------------------------
// New request mode: { reportCheck: 'ftc' }. Distinct from docType/category
// above because an FTC report isn't a photo ID or proof-of-address — it's
// the identitytheft.gov-generated PDF/screenshot reps now must attach when
// checking the FTC box in Docs Routing (see LogChecklistItemModal.jsx's
// requireUpload). Checks, per product spec: report number format (9
// digits), a report date/time is present, name/email/phone on the report
// against the client record, and that the standard report header/footer
// are visible (evidence it's a genuine, complete report rather than a
// cropped screenshot). Blind extraction, same as everywhere else in this
// file — comparisons happen in code, not in the model's own judgment.
function buildFtcReportPrompt(today: string): string {
  return `You are reviewing an uploaded image that is supposed to be an FTC Identity Theft Report (the report generated at identitytheft.gov after filing an identity theft complaint).

- First confirm this is genuinely an FTC Identity Theft Report and not some other document. If it clearly isn't, status must be "invalid".
- Locate the Report Number printed on the document (usually labeled "Report Number" or similar) and extract it into "reportNumber" as digits only, no spaces or dashes. If you can't find or read one, use null.
- Locate the date (and time, if shown) the report was filed/generated and extract the date into "reportDate" as "YYYY-MM-DD" (null if unreadable), and the time into "reportTime" as "HH:MM" 24-hour (null if not shown or unreadable).
- Extract the name, email address, and phone number printed on the report into "extractedName", "extractedEmail", "extractedPhone" respectively (null for any that aren't present or legible).
- Note whether the document shows the standard FTC / IdentityTheft.gov report header and footer (letterhead, branding, page footer text) into "hasHeaderFooter" (true/false) — a genuine complete report shows both; a cropped screenshot or partial capture often doesn't.
- Today's date is ${today}. This document type doesn't expire, so don't fail it for age alone.
- If the document is genuine, legible, and a report number was found, status is "valid". If you can tell it's an FTC report but can't confidently read the report number or other key fields, status is "needs_review". If it's clearly not an FTC report at all, status is "invalid".

Respond with strict JSON only, in this exact shape:
{
  "status": "valid" | "invalid" | "needs_review",
  "confidence": <number between 0 and 1>,
  "reportNumber": "<digits only>" or null,
  "reportDate": "YYYY-MM-DD" or null,
  "reportTime": "HH:MM" or null,
  "extractedName": "<name exactly as printed>" or null,
  "extractedEmail": "<email exactly as printed>" or null,
  "extractedPhone": "<phone exactly as printed>" or null,
  "hasHeaderFooter": true or false,
  "reasoning": "<one or two sentences explaining the decision, including what you read on the document>"
}

Be conservative: if you are not confident, use "needs_review" rather than guessing.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const {
      docType, category, reportCheck, imageDataUrl,
      clientName, clientAddress, clientSsn, clientEmail, clientPhone, clientDob, today
    } = await req.json();

    // Exactly one of docType (legacy, admin CoverLetterAssets.jsx),
    // category (LTOS, CoverLetterAssetsLTOS.jsx), or reportCheck:'ftc'
    // (FTC Identity Theft Report, LogChecklistItemModal.jsx's required
    // upload) is expected — never more than one, never none.
    const isCategoryRequest = !docType && !reportCheck && !!category;
    const isReportCheckRequest = !docType && !category && reportCheck === 'ftc';
    if (!isCategoryRequest && !isReportCheckRequest && (!docType || !DOC_TYPE_LABELS[docType])) {
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
    const prompt = isReportCheckRequest
      ? buildFtcReportPrompt(effectiveToday)
      : isCategoryRequest
      ? buildCategoryPrompt(category, effectiveToday)
      : buildPrompt(docType, effectiveToday);

    const openai = new OpenAI({ apiKey: openaiKey });
    const completion = await openai.chat.completions.create({
      // gpt-4o over gpt-4-turbo: stronger vision/OCR benchmarks (better at
      // reading small printed fields like DOB/address on a phone-photo ID)
      // and typically cheaper per request. Swapped 2026-08-25 per explicit
      // request after a photocopied license produced weak extraction.
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            // detail:'high' forces the model to process the image at full
            // resolution (multiple high-res tiles) instead of the default
            // 'auto', which can silently downscale a large or dense image
            // before reading it — the single biggest lever available here
            // for OCR accuracy on small printed fields like a DOB or
            // address line. Costs more tokens per request; worth it for a
            // document a human is trusting a status/match result from.
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 700
    });

    const responseText = completion.choices?.[0]?.message?.content;
    if (!responseText) throw new Error('No response from OpenAI');
    const parsed = JSON.parse(responseText);

    let status = VALID_STATUSES.includes(parsed?.status) ? parsed.status : 'needs_review';
    const confidence = typeof parsed?.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : null;
    const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(parsed?.expiresAt || '') ? parsed.expiresAt : null;
    const issuedAt = /^\d{4}-\d{2}-\d{2}$/.test(parsed?.issuedAt || '') ? parsed.issuedAt : null;
    const extractedDob = /^\d{4}-\d{2}-\d{2}$/.test(parsed?.extractedDob || '') ? parsed.extractedDob : null;
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
    // Applies to licenses/state IDs specifically — passports have no
    // issue-date field to cross-check against, so they're excluded here.
    const isLicenseLike = docType === 'license' || (category === 'identity' && (detectedType === 'driver_license' || detectedType === 'state_id'));
    if (expiresAt && issuedAt && expiresAt <= issuedAt && isLicenseLike) {
      status = 'needs_review';
      reasoning = `${reasoning} [Auto-flagged: the extracted expiration date (${expiresAt}) is not after the extracted issue date (${issuedAt}) — likely read the wrong date field (ISS vs EXP). Please verify manually.]`.trim();
    } else if (expiresAt && !issuedAt && isLicenseLike && status !== 'invalid' && status !== 'needs_review') {
      // The model reported an expiration date but never extracted an issue
      // date at all — the pair-based check above can't run, so this read
      // is unverified. Rather than trust a single unchecked date (which is
      // exactly how a wrong-field read slips through as "valid"/"expired"),
      // downgrade so a human confirms which field was actually read.
      status = 'needs_review';
      reasoning = `${reasoning} [Auto-flagged: no issue date (ISS/4a) was extracted alongside the expiration date, so the ISS-vs-EXP read couldn't be cross-checked. Please verify manually.]`.trim();
    }

    // Deterministic valid/expired override for identity documents with a
    // real printed expiration date (licenses, state IDs, passports).
    // Reported bug: the model correctly extracted expiresAt = 2028-12-23
    // (a date over two years in the future) but still reasoned "the
    // expiration date is before today... the license is expired" — a pure
    // date-comparison error, not a misread. LLMs are unreliable at doing
    // calendar arithmetic in prose, so once we trust the extracted
    // expiresAt (it already survived the ISS/EXP checks above), the
    // valid-vs-expired call itself should never be left to the model's own
    // reasoning — a string compare in code can't get this wrong. Only
    // applies when status is currently "valid" or "expired" (i.e. the
    // model made a date-based call at all); "invalid"/"needs_review" are
    // left alone since those aren't date-comparison outcomes.
    const isExpirationDoc = docType === 'license' || (category === 'identity' && (detectedType === 'driver_license' || detectedType === 'state_id' || detectedType === 'passport'));
    if (isExpirationDoc && expiresAt && (status === 'valid' || status === 'expired')) {
      const correctStatus = expiresAt < effectiveToday ? 'expired' : 'valid';
      if (correctStatus !== status) {
        reasoning = `${reasoning} [Auto-corrected: model reported "${status}" but the extracted expiration date (${expiresAt}) is ${correctStatus === 'expired' ? 'before' : 'not before'} today (${effectiveToday}), so status was corrected to "${correctStatus}".]`.trim();
        status = correctStatus;
      }
    }

    // --- ALIGNMENT CHECK: deterministic comparisons -----------------------
    // See the file header + helper functions above — every comparison here
    // runs in code against a blind extraction, never the model's own
    // "does this match" judgment.
    let checks: Record<string, unknown> | null = null;

    if (isReportCheckRequest) {
      const reportNumber = typeof parsed?.reportNumber === 'string' ? parsed.reportNumber.replace(/\D/g, '') : null;
      const reportNumberValid = reportNumber ? /^\d{9}$/.test(reportNumber) : null;
      const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed?.reportDate || '') ? parsed.reportDate : null;
      const reportTime = /^\d{2}:\d{2}$/.test(parsed?.reportTime || '') ? parsed.reportTime : null;
      const hasHeaderFooter = typeof parsed?.hasHeaderFooter === 'boolean' ? parsed.hasHeaderFooter : null;
      const ftcExtractedName = typeof parsed?.extractedName === 'string' ? parsed.extractedName : null;
      const ftcExtractedEmail = typeof parsed?.extractedEmail === 'string' ? parsed.extractedEmail : null;
      const ftcExtractedPhone = typeof parsed?.extractedPhone === 'string' ? parsed.extractedPhone : null;

      checks = {
        reportNumber,
        reportNumberValid,
        reportDate,
        reportTime,
        hasHeaderFooter,
        nameMatch: namesLikelyMatch(ftcExtractedName, clientName),
        emailMatch: emailsMatch(ftcExtractedEmail, clientEmail),
        phoneMatch: phonesMatch(ftcExtractedPhone, clientPhone),
      };

      // A report number that was read but isn't 9 digits, or wasn't found
      // at all, means the one required field on this whole check is
      // unverified — never leave that as "valid" on the model's say-so.
      if (status === 'valid' && reportNumberValid === false) {
        status = 'needs_review';
        reasoning = `${reasoning} [Auto-flagged: report number "${reportNumber}" is not 9 digits — please verify manually.]`.trim();
      } else if (status === 'valid' && !reportNumber) {
        status = 'needs_review';
        reasoning = `${reasoning} [Auto-flagged: no report number could be read from the document.]`.trim();
      }
    } else {
      const extractedName = typeof parsed?.extractedName === 'string' ? parsed.extractedName : null;
      const extractedAddress = typeof parsed?.extractedAddress === 'string' ? parsed.extractedAddress : null;
      const extractedSsn = typeof parsed?.extractedSsn === 'string' ? parsed.extractedSsn : null;
      // A driver's license/state ID prints a mailing address too, not just
      // POA documents — added per product request so re-uploading a
      // license also cross-checks address (and DOB, below), not just name.
      // Passports are deliberately excluded: US passports don't print a
      // mailing address, so isAddressDoc would otherwise pin a stray
      // extractedAddress the model hallucinated to satisfy the schema.
      const isAddressDoc = docType === 'poa' || docType === 'letter' || category === 'address'
        || docType === 'license' || (category === 'identity' && (detectedType === 'driver_license' || detectedType === 'state_id'));
      // DOB, unlike address, prints on every identity document type
      // including passports.
      const isDobDoc = docType === 'license' || category === 'identity';

      checks = {
        ssnMatch: docType === 'ssn' ? ssnsMatch(extractedSsn, clientSsn) : null,
        nameMatch: namesLikelyMatch(extractedName, clientName),
        addressMatch: isAddressDoc ? addressesLikelyMatch(extractedAddress, clientAddress) : null,
        dobMatch: isDobDoc ? dobsMatch(extractedDob, clientDob) : null,
        // Raw extracted values, not just the match booleans above — added
        // so the UI can show "AI detected from ID: <value>" right next to
        // what's on file (ClientHeader.jsx's Personal Info section), not
        // just a match/mismatch badge. Scoped to only the doc types that
        // actually extract each field (see extractionNote above), so a
        // license row never carries a stray extractedAddress, etc.
        extractedName,
        extractedAddress: isAddressDoc ? extractedAddress : null,
        extractedSsn: docType === 'ssn' ? extractedSsn : null,
        extractedDob: isDobDoc ? extractedDob : null,
      };
    }

    return new Response(
      JSON.stringify({ success: true, status, confidence, expiresAt, issuedAt, reasoning, detectedType, checks }),
      { headers }
    );
  } catch (err) {
    console.error('❌ validate-document error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers });
  }
});
