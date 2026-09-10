// src/utils/progressWeighting.js
//
// Single definition of the weighted `clients.progress` formula, per the
// partner ask: progress should reflect that staff are actively working a
// file (docs sent, bureaus called) even before any inquiry is deleted —
// today's dispute-outcome-only number can read 0% for weeks of real work.
//
// Formula: 70% dispute outcome + 10% FTC filed + 10% CFPB filed +
// 10% bureau calls (partial credit, ~3.33% per distinct bureau called at
// least once — not all-or-nothing).
//
// Applies to ALL 4 services (Inquiry Deletion, Case Management, Fraud Alert
// Removal, Personal Identifiers), but each has a different source for the
// 70% "outcome" component:
//   - Inquiry Deletion / Case Management: utils/inquiryCounts.js#
//     computeBureauProgress's `progress` (deleted / disputable, from the
//     classified thread).
//   - Fraud Alert Removal / Personal Identifiers: useClientActions.js#
//     directBureauProgress (resolved bureaus / 3 — these services have no
//     thread.json classification, see that function's own comment).
// Both of those are now saved verbatim into the new `clients.outcome_ratio`
// column (sql/add_outcome_ratio.sql) instead of being written straight to
// `progress` — `progress` is always this file's BLEND of outcome_ratio +
// docs/calls credit, so it can be recomputed from stored columns alone by
// any of the 4 trigger points below without re-fetching a client's whole
// inquiry thread.
//
// The 4 places `clients.progress` can change, and what each does:
//   1. useInquiriesThread.js (classification save) — outcome_ratio changes.
//      Computes the new outcome_ratio itself, calls computeWeightedProgress
//      to get the blended progress, writes both into its own existing
//      clients update payload.
//   2. useClientActions.js#markBureauComplete/markBureauNA (FAR/PI direct
//      bureau flags) — outcome_ratio changes. Same pattern as #1.
//   3. DocumentRouting.jsx#toggleCheck (FTC/CFPB checkbox) — docs credit
//      changes, outcome_ratio doesn't. Calls
//      recomputeProgressFromDocsOrCalls, which re-reads the client's
//      already-stored outcome_ratio rather than recomputing it.
//   4. LogCallModal.jsx (call logged) — calls credit changes, outcome_ratio
//      doesn't. Same as #3.
//
// FTC/CFPB credit is read from the client's LATEST document_routing round
// only (a new round resets those checkboxes, which is correct — a second
// round's docs genuinely haven't been filed yet). Calls credit is
// cumulative across all of call_logs for the client (any bureau ever
// called at least once keeps its credit even after a new docs round starts)
// — matches the plain-English ask ("calls when 3 bureaus are called at
// least once") which had no round-scoping to it, unlike the FTC/CFPB half.

import { supabase } from "../supabaseClient";

export const PROGRESS_WEIGHTS = {
  outcome: 0.70,
  ftc: 0.10,
  cfpb: 0.10,
  calls: 0.10,
};

/**
 * Pure blend — no I/O. `bureausCalled` is a count 0-3 (distinct bureaus
 * ever called at least once), giving ~3.33% credit per bureau rather than
 * all-or-nothing at 3.
 *
 * A fully-resolved outcome (outcomeRatio 1 — every bureau Deleted/N-A/
 * Linked-DND, or all 3 resolved for FAR/PI) always reads 100%, full stop,
 * regardless of FTC/CFPB/calls credit. The 70/10/10/10 split governs how
 * progress climbs WHILE a file is still open — it was never meant to cap a
 * genuinely finished client below 100% just because nobody logged a call
 * or checked a box that no longer matters once the work is done. (Caught
 * from the sql/add_outcome_ratio.sql STEP 3 preview: clients already at
 * current_progress 1.00 were computing down to 0.03-0.10 with no docs/
 * calls rows on file — that's backwards.)
 */
export function blendProgress({ outcomeRatio, ftcCompleted, cfpbCompleted, bureausCalled }) {
  const outcome = Math.min(1, Math.max(0, Number(outcomeRatio) || 0));
  if (outcome >= 1) return 1;

  const calledCount = Math.min(3, Math.max(0, Number(bureausCalled) || 0));

  const blended =
    PROGRESS_WEIGHTS.outcome * outcome +
    PROGRESS_WEIGHTS.ftc * (ftcCompleted ? 1 : 0) +
    PROGRESS_WEIGHTS.cfpb * (cfpbCompleted ? 1 : 0) +
    PROGRESS_WEIGHTS.calls * (calledCount / 3);

  // 4 decimals (not the 2 the old outcome-only progress used) — the calls
  // component's ~3.33% steps would otherwise round away to nothing. Every
  // display site already does Math.round(progress * 100) for the shown
  // percentage, so the extra precision here is invisible to staff/partners.
  return Number(Math.min(1, Math.max(0, blended)).toFixed(4));
}

/**
 * Docs credit (latest document_routing round's ftc_completed/cfpb_completed)
 * + calls credit (distinct bureaus ever logged in call_logs) for one client.
 * Degrades to "no credit" on any query failure rather than throwing — a
 * partner-facing progress number should never hard-fail a save over this.
 */
export async function fetchDocsCallsCredit(clientId) {
  if (!clientId) return { ftcCompleted: false, cfpbCompleted: false, bureausCalled: 0 };

  const [{ data: latestRouting, error: routingErr }, { data: callRows, error: callErr }] = await Promise.all([
    supabase
      .from("document_routing")
      .select("ftc_completed, cfpb_completed")
      .eq("client_id", clientId)
      .order("round_count", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("call_logs")
      .select("exp_result, tu_result, eq_result")
      .eq("client_id", clientId),
  ]);

  if (routingErr) console.warn("progressWeighting: could not load document_routing for docs credit:", routingErr.message);
  if (callErr) console.warn("progressWeighting: could not load call_logs for calls credit:", callErr.message);

  // Only one of exp/tu/eq_result is ever set per call_logs row (LogCallModal
  // submits one bureau at a time — see its own payload) — a non-null value
  // means that bureau was called, regardless of the outcome logged.
  const called = new Set();
  (callRows || []).forEach((r) => {
    if (r.exp_result) called.add("exp");
    if (r.tu_result) called.add("tu");
    if (r.eq_result) called.add("eq");
  });

  return {
    ftcCompleted: !!latestRouting?.ftc_completed,
    cfpbCompleted: !!latestRouting?.cfpb_completed,
    bureausCalled: called.size,
  };
}

/**
 * For the 2 trigger points that already know the fresh outcome_ratio
 * (useInquiriesThread.js, useClientActions.js#markBureauComplete/NA) —
 * fetches docs/calls credit and returns the blended progress. Callers write
 * both `progress` (this return value) and `outcome_ratio` (their own input)
 * into their own update payload rather than this helper doing a second,
 * redundant write.
 */
export async function computeWeightedProgress(clientId, outcomeRatio) {
  const { ftcCompleted, cfpbCompleted, bureausCalled } = await fetchDocsCallsCredit(clientId);
  return blendProgress({ outcomeRatio, ftcCompleted, cfpbCompleted, bureausCalled });
}

/**
 * For the 2 trigger points that only ever change the docs/calls side
 * (DocumentRouting.jsx's FTC/CFPB toggle, LogCallModal.jsx after logging a
 * call) — re-reads the client's own stored outcome_ratio (so this can't
 * silently reset it), recomputes the blend, and saves `progress` directly.
 *
 * Falls back to the client's current `progress` if outcome_ratio is null
 * (a client whose outcome hasn't been (re)computed since this feature
 * shipped) — a reasonable proxy since, before this change, `progress` WAS
 * the outcome ratio (at 100% weight) for every service. Self-corrects the
 * next time #1/#2 above run.
 *
 * If sql/add_outcome_ratio.sql hasn't been run yet, the select below fails
 * outright (unknown column) and this no-ops rather than throwing — matches
 * every other "migration might not be run yet" call site in this app (see
 * utils/clientDuplicateRound.js#insertClientRecord).
 */
export async function recomputeProgressFromDocsOrCalls(clientId) {
  if (!clientId) return null;

  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("outcome_ratio, progress")
    .eq("id", clientId)
    .maybeSingle();

  if (clientErr) {
    console.warn("progressWeighting: outcome_ratio not available yet (run sql/add_outcome_ratio.sql) — skipping progress recompute:", clientErr.message);
    return null;
  }

  const outcomeRatio = clientRow?.outcome_ratio ?? clientRow?.progress ?? 0;
  const blended = await computeWeightedProgress(clientId, outcomeRatio);

  const { error: updErr } = await supabase.from("clients").update({ progress: blended }).eq("id", clientId);
  if (updErr) {
    console.warn("progressWeighting: could not save recomputed progress:", updErr.message);
    return null;
  }
  return blended;
}
