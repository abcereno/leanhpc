// src/utils/inquiryCounts.js
//
// Single definition of the Phase 0 "AI Count" persisted to
// clients.ai_exp_count / ai_tu_count / ai_eq_count — the actionable
// (disputable) inquiry count per bureau. Every save path that writes these
// columns (useInquiriesThread.js's saveUpdatedThread, UploadReportForm.jsx's
// handleSave, SmartIdiQModal.jsx's commonUpdateAndUpload) imports this
// instead of re-deriving the count itself, so "how many inquiries did the
// AI find" can never drift into three different answers depending on which
// upload path was used — the exact class of bug (a 77-vs-25 mismatch) this
// whole Phase 0 change exists to prevent.
//
// "Disputable" mirrors the rule useInquiriesThread.js already applied to
// start_inquiries/progress before this file existed: items classified
// "linked" or "dnd" are excluded, since a linked/do-not-dispute item isn't
// really an inquiry being pursued.

const IGNORED_CLASSIFICATIONS = new Set(["linked", "dnd"]);

function isIgnored(classification) {
  return IGNORED_CLASSIFICATIONS.has(String(classification || "").trim().toLowerCase());
}

function countDisputable(list) {
  return (list || []).filter((i) => !isIgnored(i?.classification)).length;
}

// Exported aliases, named to match how the rest of the app (and staff)
// actually talk about these three buckets: disputable (Non-Linked/
// Associated/Dispute), Deleted, and non-disputable (Linked/Do-Not-Dispute).
// Every save path that needs to know "is this classification one we act
// on" should import these instead of re-declaring its own normalize/ignore
// helpers — see classifyBureauStatus below for why that duplication was a
// real bug, not just a style nitpick.
export function normalizeClassification(classification) {
  return String(classification || "").trim().toLowerCase();
}

export function isNonDisputableClassification(classification) {
  return isIgnored(classification);
}

function isDeletedClassification(classification) {
  return normalizeClassification(classification) === "deleted";
}

/**
 * Per-bureau completion status derived purely from classification data —
 * the ONE definition every save path must use.
 *
 * Before this existed, the exact same logic was independently copy-pasted
 * into reportAutoImport.js, Fetch3bModal.jsx's initial-import branch, and
 * SmartIdiQModal.jsx (which didn't even attempt an N/A recompute, just
 * hardcoding false/leaving stale na flags in place) — and two of those
 * copies had a bug where "dnd" (Do Not Dispute) was left out of both the
 * "na" and "done" checks, so a bureau made up entirely of Do-Not-Dispute
 * items would incorrectly read as "incomplete" forever. Only
 * useInquiriesThread.js's manual-save path had the correct version. This
 * function is that correct version, now shared everywhere so a fix here
 * can't drift out of sync with any one save path again.
 *
 *  - "na": nothing to work here — the list is empty, or every item is
 *    Linked or Do-Not-Dispute (non-disputable).
 *  - "done": every item is non-disputable (Linked/DND) or Deleted.
 *  - "incomplete": anything else still needs attention.
 */
export function classifyBureauStatus(list) {
  const L = Array.isArray(list) ? list : [];
  if (L.length === 0) return "na";
  const allNonDisputable = L.every((i) => isNonDisputableClassification(i?.classification));
  if (allNonDisputable) return "na";
  const allResolved = L.every((i) => isNonDisputableClassification(i?.classification) || isDeletedClassification(i?.classification));
  if (allResolved) return "done";
  return "incomplete";
}

/**
 * Full progress/completion recompute from a client's classified inquiry
 * thread — `grouped` is `{ experian, transunion, equifax }` (accounts is
 * ignored here; it isn't part of this calculation). This is the single
 * source of truth for clients.progress/exp_completed/tu_completed/
 * eq_completed/exp_na/tu_na/eq_na, so every save path — manual
 * classification edits in InquiriesThread.jsx, the SmartCredit/IdentityIQ
 * initial-import modals, and the company-portal auto-import flow — always
 * derives the exact same result from the same data instead of each one
 * silently drifting out of sync with (or hardcoding zero/false regardless
 * of) what's actually classified.
 *
 * Progress = deleted ÷ disputable (everything except Linked/DND — deleted
 * items count in the denominator since they WERE disputable and got
 * resolved), forced to 100% once every bureau is done/N-A so a client with
 * zero disputable items left (nothing to divide by) still reads as
 * finished rather than 0%.
 *
 * `expStatus`/`tuStatus`/`eqStatus` on the returned object are the
 * classification-completion label ("na"/"done"/"incomplete") — NOT the
 * same thing as clients.exp_status/tu_status/eq_status, which track call
 * outcomes (see utils/workflowStage.js / CallRouting.jsx) and are a
 * completely separate concept that happens to share a similar name.
 */
export function computeBureauProgress(grouped) {
  const expStatus = classifyBureauStatus(grouped?.experian);
  const tuStatus = classifyBureauStatus(grouped?.transunion);
  const eqStatus = classifyBureauStatus(grouped?.equifax);

  const isFullyCompleted =
    ["done", "na"].includes(expStatus) &&
    ["done", "na"].includes(tuStatus) &&
    ["done", "na"].includes(eqStatus);

  const totalAll = [
    ...(grouped?.experian || []),
    ...(grouped?.transunion || []),
    ...(grouped?.equifax || []),
  ];
  const deletedCount = totalAll.filter((i) => isDeletedClassification(i?.classification)).length;
  const disputableCount = countDisputable(totalAll);

  const progress = isFullyCompleted
    ? 1
    : disputableCount > 0
    ? Number((deletedCount / disputableCount).toFixed(2))
    : 0;

  return {
    expStatus,
    tuStatus,
    eqStatus,
    exp_completed: expStatus === "done",
    tu_completed: tuStatus === "done",
    eq_completed: eqStatus === "done",
    exp_na: expStatus === "na",
    tu_na: tuStatus === "na",
    eq_na: eqStatus === "na",
    isFullyCompleted,
    progress,
    deletedCount,
    disputableCount,
  };
}

/**
 * Whether a client row (already carrying exp/tu/eq_completed and
 * exp/tu/eq_na — from a `clients` select, not `grouped` classification
 * data) is fully resolved: every bureau is either Complete OR N/A. Matches
 * this file's own isFullyCompleted above, useClientActions.js's
 * directBureauProgress, and the `update_client_completion_status` DB
 * trigger's definition — all of which already treat an N/A bureau as done.
 *
 * A plain `exp_completed && tu_completed && eq_completed` check (ignoring
 * _na) used to be duplicated across several call sites and silently
 * disagreed with the definition above: a client fully resolved with one
 * legitimately N/A bureau reads progress: 100% (isFullyCompleted counts na
 * as done) but would never satisfy the strict AND-of-completed check, so it
 * never showed as "Completed" — missing from completed-only filters, and
 * (for AdminClientList.jsx/InquiryRemovalClientList.jsx's row coloring)
 * stuck in whatever aging color its day count happened to fall into
 * instead of turning green. ServiceClientList.jsx already carried a local,
 * correctly-fixed copy of this same check (see its own isAllDone comment);
 * this is that same definition, centralized so it can't drift again.
 */
export function allBureausResolved(client) {
  return !!(
    (client?.exp_completed || client?.exp_na) &&
    (client?.tu_completed || client?.tu_na) &&
    (client?.eq_completed || client?.eq_na)
  );
}

/**
 * `grouped` is `{ experian, transunion, equifax }` — each an array of
 * inquiry items with a `.classification` field. Matches the shape already
 * used by useInquiriesThread.js's `grouped`, UploadReportForm.jsx's
 * `parsedInquiries`, and SmartIdiQModal.jsx's `classified`.
 */
export function computeAiCounts(grouped) {
  return {
    ai_exp_count: countDisputable(grouped?.experian),
    ai_tu_count: countDisputable(grouped?.transunion),
    ai_eq_count: countDisputable(grouped?.equifax),
  };
}

/**
 * Per the Phase 0 spec: approved_*_count "defaults to the AI value; only a
 * supervisor approval (Phase 2) changes these." So on every (re)parse, a
 * column that was never set gets defaulted to the fresh AI count, but one
 * a supervisor already approved is left untouched — `currentApproved`
 * should be whatever's currently in the clients row (or `{}`/undefined on
 * first save, before the columns have ever been written).
 */
export function withDefaultedApprovedCounts(aiCounts, currentApproved = {}) {
  return {
    approved_exp_count: currentApproved?.approved_exp_count ?? aiCounts.ai_exp_count,
    approved_tu_count: currentApproved?.approved_tu_count ?? aiCounts.ai_tu_count,
    approved_eq_count: currentApproved?.approved_eq_count ?? aiCounts.ai_eq_count,
  };
}

/**
 * True when a `clients.start_inquiries` value should be treated as "not
 * really set yet" — either genuinely empty, or the literal all-zero
 * placeholder ("(TU 0, EXP 0, EQ 0)", any bureau order/spacing).
 *
 * Every save path (useInquiriesThread.js, UploadReportForm.jsx,
 * SmartIdiQModal.jsx) freezes start_inquiries the first time it sees a
 * truthy value and never touches it again. That's correct for a real
 * count, but a degenerate all-zero string can get written before real
 * thread data exists — e.g. a save while the thread editor was still
 * empty, or the free-text "Edit Start Inquiries" prompt() override in
 * RemindersSidebar.jsx, which has no validation at all. Without this
 * check, a bad zero value freezes permanently and can never self-correct
 * once real inquiries are added, even though a plain truthiness check
 * treats it as "already set."
 */
/**
 * Priority 2's "large difference" confirmation gate: warn a supervisor
 * before they approve a count that differs a lot from what the AI found.
 * Per the plan doc's own suggested default — "difference > 5 or > 50%,
 * whichever is smaller trigger" — i.e. the alarm threshold is whichever of
 * those two numbers is smaller, so a big AI count still gets flagged for a
 * relatively small % swing, and a tiny AI count still gets flagged for a
 * small absolute swing.
 */
export function isLargeCountDifference(aiCount, approvedCount) {
  const ai = Number(aiCount) || 0;
  const approved = Number(approvedCount) || 0;
  const diff = Math.abs(approved - ai);
  const threshold = Math.min(5, ai * 0.5);
  return diff > threshold;
}

export function isBlankStartInquiries(value) {
  if (value == null || value === "" || value === 0 || value === "0") return true;
  const match = String(value).match(/TU\s*(-?\d+).*?EXP\s*(-?\d+).*?EQ\s*(-?\d+)/i);
  if (!match) return false;
  return match.slice(1, 4).every((n) => Number(n) === 0);
}

/**
 * The classifications that mean "this inquiry is still a live candidate to
 * be disputed" — not yet resolved (Deleted), not excluded (Linked/DND).
 * Single source of truth shared by useInquiriesThread.js's letter-generation
 * filter AND its automatic count-review sync (see saveUpdatedThread's
 * syncCountReviewRequests) — a supervisor approving "how many inquiries
 * should be removed" is approving exactly this count, so both features must
 * always agree on what counts as disputable.
 */
export const DISPUTE_PENDING_CLASSIFICATIONS = new Set(["non-linked", "associated", "dispute"]);

function isDisputePending(classification) {
  return DISPUTE_PENDING_CLASSIFICATIONS.has(String(classification || "").trim().toLowerCase());
}

/**
 * Per-bureau count of items currently classified Non-Linked/Associated/
 * Dispute — the number a supervisor is asked to confirm via the Count
 * Review queue, and (once approved) what gets written to
 * clients.approved_{bureau}_count.
 */
export function computeDisputePendingCounts(grouped) {
  return {
    Experian: (grouped?.experian || []).filter((i) => isDisputePending(i?.classification)).length,
    TransUnion: (grouped?.transunion || []).filter((i) => isDisputePending(i?.classification)).length,
    Equifax: (grouped?.equifax || []).filter((i) => isDisputePending(i?.classification)).length,
  };
}

/**
 * Flat inquiries -> { Experian: [{creditor, date}], TransUnion: [...], ... }
 * for whichever bureaus currently have Non-Linked/Associated/Dispute items.
 * Same grouping rule useInquiriesThread.js#generateDisputeLetters applies
 * inline for the existing Apps Script letter flow — pulled out here as a
 * shared, additive export so the new in-house letter generator
 * (LetterEditorModal.jsx) can reuse the identical "what's disputable"
 * definition without editing that existing, already-live function.
 */
export function groupDisputableByBureau(inquiries) {
  const disputable = (inquiries || []).filter((i) => isDisputePending(i?.classification));
  return disputable.reduce((acc, i) => {
    let bureau = i.bureau || "Unknown";
    if (bureau === "EX") bureau = "Experian";
    if (bureau === "TU") bureau = "TransUnion";
    if (bureau === "EQ") bureau = "Equifax";
    (acc[bureau] ||= []).push({ creditor: i.creditor, date: i.date });
    return acc;
  }, {});
}
