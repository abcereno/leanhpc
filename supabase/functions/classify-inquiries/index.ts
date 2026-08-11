// supabase/functions/classify-inquiries/index.ts
//
// Not previously tracked in this repo — this is now the canonical source
// for the function (it lives in a Supabase project that isn't mounted
// here), so redeploy this file's contents after editing it
// (`supabase functions deploy classify-inquiries`, or paste into the
// dashboard function editor).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { OpenAI } from 'https://esm.sh/openai@4.0.0';

const headers = new Headers({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
});

// ---------------------------------------------------------------------
// LENDER ALIAS TABLE (sql/add_lender_aliases.sql)
//
// The caller (src/utils/classifyInquiries.js) fetches the whole
// public.lender_aliases table client-side and forwards it here as
// `lenderAliases` — one row per {canonical_name, alias, category,
// requires_manual_review, related_canonical_name}. This function never
// queries the DB itself; it just resolves names against whatever list it
// was handed, so a missing/empty list degrades gracefully to the old
// loose-substring matching instead of failing.
//
// resolveCanonical looks up a raw creditor string against known aliases
// (exact match first, then containment for OCR-truncated variants).
// namesLikelyMatch uses that to decide "same lender" with real identity
// data when both sides are known, including the dealership ->
// captive-finance-company relationship (e.g. "BMW OF ONTAR" inquiry
// linking to a "BMW FIN SVC" account) — and falls back to the original
// loose heuristic only when one or both sides aren't in the table yet.
// ---------------------------------------------------------------------

function normalizeAliasKey(s: unknown): string {
  return String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function buildAliasMap(lenderAliases: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const row of Array.isArray(lenderAliases) ? lenderAliases : []) {
    const key = normalizeAliasKey(row?.alias);
    if (key) map.set(key, row);
  }
  return map;
}

function resolveCanonical(name: unknown, aliasMap: Map<string, any>): any | null {
  const key = normalizeAliasKey(name);
  if (!key || aliasMap.size === 0) return null;
  if (aliasMap.has(key)) return aliasMap.get(key);
  // Fall back to containment, in case the report truncates/pads a known
  // alias (OCR artifact) rather than a byte-for-byte match.
  for (const [aliasKey, row] of aliasMap) {
    if (key.includes(aliasKey) || aliasKey.includes(key)) return row;
  }
  return null;
}

function isManualReviewIdentity(name: unknown, aliasMap: Map<string, any>): boolean {
  return !!resolveCanonical(name, aliasMap)?.requires_manual_review;
}

// ---------------------------------------------------------------------
// DETERMINISTIC LINKING GUARD
//
// Real-world bug this exists to fix: a client's Experian inquiry
// "JPMCB CARD" (2025-07-08) was classified "linked" by the model even
// though the only same-name account on file opened 2024-12-07 — about
// 7 months earlier. The old prompt used one flat 12-month window for
// every account type, so a 7-month gap slipped through even though no
// credit-card approval realistically takes 7 months to open an account.
//
// Date-window math is exact arithmetic, not something worth trusting an
// LLM's judgment on — a model can misjudge a date gap the same way it
// can misread an OCR'd date. So after the model classifies, this guard
// re-checks every "linked"/"associated" call against the actual accounts
// array using hard type-based rules and downgrades anything that doesn't
// actually satisfy them. It only ever downgrades (removes a wrong
// linked/associated call) — it does not add new links the model missed;
// catching those (via the alias table above) is the model's job, done
// via the prompt, not this guard's.
// ---------------------------------------------------------------------

function normalizeCreditorName(name: unknown): string {
  return String(name || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(NA|N A|INC|LLC|CO|CORP|USA|BANK|BK|CARD|CREDIT|FINANCIAL|FIN|SVC|SERVICES|SERVICE)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Loose fallback for names not found in the alias table: normalize both
// and treat one containing the other as a match (handles "JPMCB" vs
// "JPMCB CARD", "TD BANK N.A." vs "TDBANKNA", etc.). Only used when the
// alias table has no entry for one or both sides — see namesLikelyMatch.
function looseNamesMatch(a: unknown, b: unknown): boolean {
  const na = normalizeCreditorName(a);
  const nb = normalizeCreditorName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function namesLikelyMatch(a: unknown, b: unknown, aliasMap: Map<string, any>): boolean {
  const resolvedA = resolveCanonical(a, aliasMap);
  const resolvedB = resolveCanonical(b, aliasMap);
  if (resolvedA && resolvedB) {
    if (resolvedA.canonical_name === resolvedB.canonical_name) return true;
    // Dealership <-> captive finance company (e.g. "BMW of Ontario"
    // inquiry, "BMW Financial Services" account) — same financing event,
    // different name on each side by design.
    if (resolvedA.related_canonical_name && resolvedA.related_canonical_name === resolvedB.canonical_name) return true;
    if (resolvedB.related_canonical_name && resolvedB.related_canonical_name === resolvedA.canonical_name) return true;
    // Both sides are known, distinct, unrelated lenders — trust the
    // table over a loose string guess rather than falling through.
    return false;
  }
  return looseNamesMatch(a, b);
}

function isMortgageAccount(acct: any): boolean {
  const type = String(acct?.type || '').toLowerCase();
  const creditor = String(acct?.creditor || '').toLowerCase();
  return type.includes('mortgage') || type.includes('real estate') || /\bmtg\b|mortgage/.test(creditor);
}

function isInstallmentAccount(acct: any): boolean {
  return String(acct?.type || '').toLowerCase().includes('installment');
}

function isRevolvingAccount(acct: any): boolean {
  return String(acct?.type || '').toLowerCase().includes('revolving');
}

// Broader than isInstallmentAccount/isMortgageAccount — used only for the
// Experian "associated" rule, which per spec covers auto, mortgage, real
// estate, or installment accounts.
function isAssociatedEligibleType(acct: any): boolean {
  const type = String(acct?.type || '').toLowerCase();
  const creditor = String(acct?.creditor || '').toLowerCase();
  return (
    type.includes('auto') ||
    type.includes('installment') ||
    isMortgageAccount(acct) ||
    /\bauto\b/.test(creditor)
  );
}

// Positive = account opened AFTER the inquiry (the expected direction —
// an inquiry precedes the account it caused). Returns null on unparsable
// dates so callers can fail closed (never link on bad data).
function daySpread(dateOpenedStr: unknown, inquiryDateStr: unknown): number | null {
  const opened = new Date(String(dateOpenedStr));
  const inquiry = new Date(String(inquiryDateStr));
  if (isNaN(opened.getTime()) || isNaN(inquiry.getTime())) return null;
  return Math.round((opened.getTime() - inquiry.getTime()) / 86400000);
}

// Type-specific "linked" window, per the business rule: 30 days for
// credit cards (revolving), 365 days for installment loans, always
// linked for mortgage/real estate regardless of date, and 180 days
// (6 months) as the floor for anything else. An account that opened
// before the inquiry never counts, mortgage included — the account has
// to actually postdate the inquiry to have been caused by it, mortgage
// only waives the date check, not the ordering.
function isWithinLinkedWindow(acct: any, spreadDays: number | null): boolean {
  if (spreadDays === null || spreadDays < 0) return false;
  if (isMortgageAccount(acct)) return true;
  if (isRevolvingAccount(acct)) return spreadDays <= 30;
  if (isInstallmentAccount(acct)) return spreadDays <= 365;
  return spreadDays <= 180;
}

function isWithinAssociatedWindow(spreadDays: number | null): boolean {
  return spreadDays !== null && spreadDays >= 0 && spreadDays <= 60;
}

function hasValidLinkedMatch(inquiry: any, accounts: any[], aliasMap: Map<string, any>): boolean {
  return accounts.some((acct) => {
    if (!namesLikelyMatch(inquiry.creditor, acct.creditor, aliasMap)) return false;
    // An identity flagged requires_manual_review (SBNA, Atlas, Flex, an
    // unconfirmed "AN#") can't confirm a link no matter how well the
    // dates line up — the safety rule from the alias table's source
    // proposal is manual review over an incorrect decision.
    if (isManualReviewIdentity(inquiry.creditor, aliasMap) || isManualReviewIdentity(acct.creditor, aliasMap)) return false;
    return isWithinLinkedWindow(acct, daySpread(acct.dateOpened, inquiry.date));
  });
}

function hasValidAssociatedMatch(inquiry: any, accounts: any[], aliasMap: Map<string, any>): boolean {
  return accounts.some((acct) => {
    if (namesLikelyMatch(inquiry.creditor, acct.creditor, aliasMap)) return false; // must NOT match, per spec
    if (!isAssociatedEligibleType(acct)) return false;
    return isWithinAssociatedWindow(daySpread(acct.dateOpened, inquiry.date));
  });
}

function guardReasonForLinked(inquiry: any, accounts: any[], aliasMap: Map<string, any>): string {
  const blockedByIdentity = accounts.some(
    (acct) =>
      namesLikelyMatch(inquiry.creditor, acct.creditor, aliasMap) &&
      (isManualReviewIdentity(inquiry.creditor, aliasMap) || isManualReviewIdentity(acct.creditor, aliasMap))
  );
  return blockedByIdentity ? 'downgraded_linked_unconfirmed_identity' : 'downgraded_linked_failed_date_window';
}

function applyDeterministicGuard(inquiryList: any[], accounts: any[], isExperian: boolean, aliasMap: Map<string, any>): any[] {
  if (!Array.isArray(inquiryList)) return inquiryList;
  return inquiryList.map((inq) => {
    if (inq?.classification === 'linked' && !hasValidLinkedMatch(inq, accounts, aliasMap)) {
      return { ...inq, classification: 'non-linked', _classifierGuard: guardReasonForLinked(inq, accounts, aliasMap) };
    }
    if (isExperian && inq?.classification === 'associated' && !hasValidAssociatedMatch(inq, accounts, aliasMap)) {
      return { ...inq, classification: 'non-linked', _classifierGuard: 'downgraded_associated_failed_window' };
    }
    return inq;
  });
}

// ---------------------------------------------------------------------
// PROMPT HELPERS — render the alias table compactly (grouped by
// canonical name, not one JSON object per row) so the model gets the
// same lender-identity knowledge the deterministic guard uses, instead
// of only being told about it after the fact.
// ---------------------------------------------------------------------

function buildAliasPromptBlock(lenderAliases: any[]): string {
  if (!Array.isArray(lenderAliases) || lenderAliases.length === 0) return '';
  const grouped = new Map<string, string[]>();
  for (const row of lenderAliases) {
    const canonical = String(row?.canonical_name || '').trim();
    const alias = String(row?.alias || '').trim();
    if (!canonical || !alias) continue;
    if (!grouped.has(canonical)) grouped.set(canonical, []);
    grouped.get(canonical)!.push(alias);
  }
  const lines: string[] = [];
  for (const [canonical, aliases] of grouped) {
    lines.push(`- ${canonical}: ${aliases.join(', ')}`);
  }
  return lines.join('\n');
}

function buildManualReviewNote(lenderAliases: any[]): string {
  const flagged = (Array.isArray(lenderAliases) ? lenderAliases : []).filter((r) => r?.requires_manual_review);
  if (!flagged.length) return '';
  const entries = flagged.map((r) => `${r.alias}${r.notes ? ` (${r.notes})` : ''}`);
  return `The following names are ambiguous, reused by multiple real companies, or unconfirmed — never classify them "linked", even on a clean date match:\n${entries.join('\n')}`;
}

function buildDealershipNote(lenderAliases: any[]): string {
  const rels = (Array.isArray(lenderAliases) ? lenderAliases : []).filter((r) => r?.related_canonical_name);
  if (!rels.length) return '';
  const lines = rels.map(
    (r) => `- "${r.alias}" is a dealership commonly financed through ${r.related_canonical_name} — if an account under that finance company's name opened around the same time as this inquiry, treat it as linked even though the names differ.`
  );
  return lines.join('\n');
}

serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response(null, {
    headers
  });
  if (req.method !== 'POST') return new Response(JSON.stringify({
    error: 'Method not allowed'
  }), {
    status: 405,
    headers
  });
  try {
    const { accounts, experian = [], transunion = [], equifax = [], lenderAliases = [] } = await req.json();
    if (!accounts || !Array.isArray(accounts)) throw new Error('Invalid or missing accounts array');
    const openaiKey = Deno.env.get('OPENAI_KEY');
    if (!openaiKey) throw new Error('Missing OpenAI key');

    const aliasMap = buildAliasMap(lenderAliases);
    const aliasBlock = buildAliasPromptBlock(lenderAliases);
    const manualReviewNote = buildManualReviewNote(lenderAliases);
    const dealershipNote = buildDealershipNote(lenderAliases);

    const prompt = `
Classify each inquiry per bureau separately using the rules below. Output the same number of inquiries as received, classified under one of: "linked", "associated", or "non-linked".

1. linked:
- Must match an account by creditor name (exact or near match). Real bureau data is full of abbreviations, truncated names, and dealership names that refer to the same lender as an account under a totally different-looking name — use the lender reference list below to resolve these before deciding names don't match.
- The account's dateOpened must be on or after the inquiry date (never link to an account that already existed before the inquiry).
- How much later the account can open depends on its type:
  - Mortgage or real estate accounts: always linked if the name matches, regardless of how much later the account opened.
  - Revolving/credit card accounts: dateOpened must be within 30 days after the inquiry date.
  - Installment accounts: dateOpened must be within 365 days after the inquiry date.
  - Any other account type: dateOpened must be within 180 days after the inquiry date.

2. associated:
- Experian only
- Account type must be auto, mortgage, real estate, or installment
- Creditor name must NOT match
- Inquiry date: 0-60 days before open date
- Multiple allowed (if not already linked)

3. non-linked:
- Everything else
- ALL TransUnion & Equifax inquiries not "linked" are "non-linked"
${aliasBlock ? `\nLender reference list — each line is one real-world lender followed by every abbreviation/variant seen on actual bureau reports. Treat any inquiry or account name matching one of these variants as referring to that lender, even if the raw text looks completely different from the canonical name:\n${aliasBlock}\n` : ''}
${dealershipNote ? `\nDealership-to-finance-company relationships:\n${dealershipNote}\n` : ''}
${manualReviewNote ? `\n${manualReviewNote}\n` : ''}
Make sure:
- No linked classification is used unless creditor names match (directly, via the lender reference list, or via a dealership relationship above) AND the account opened on or after the inquiry, within the type-specific window above
- Only Experian can have associated inquiries
- Do not change or remove any inquiries — just classify them
- Fix malformed or OCR-damaged dates before classifying (e.g., 7112/2024 → 07/12/2024, 71/12/2024 → 07/12/2024)

Accounts:
${JSON.stringify(accounts, null, 2)}

Inquiries:
${JSON.stringify({
      experian,
      transunion,
      equifax
    }, null, 2)}
`;
    const openai = new OpenAI({
      apiKey: openaiKey
    });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: {
        type: 'json_object'
      },
      temperature: 0,
      max_tokens: 4000
    });
    const responseText = completion.choices?.[0]?.message?.content;
    if (!responseText) throw new Error('No response from OpenAI');
    const inquiries = JSON.parse(responseText);

    // Deterministic guard — see the block comment above. Runs after the
    // model's own classification and can only downgrade a linked/
    // associated call that doesn't actually satisfy the date-window
    // rule or involves an unconfirmed identity; it never invents a new
    // link the model missed.
    const guarded = {
      experian: applyDeterministicGuard(inquiries.experian, accounts, true, aliasMap),
      transunion: applyDeterministicGuard(inquiries.transunion, accounts, false, aliasMap),
      equifax: applyDeterministicGuard(inquiries.equifax, accounts, false, aliasMap)
    };

    return new Response(JSON.stringify({
      success: true,
      accounts,
      ...guarded
    }), {
      headers
    });
  } catch (err) {
    console.error("❌ classify-inquiries error:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers
    });
  }
});
