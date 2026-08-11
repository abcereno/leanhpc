// src/utils/authorizationHold.js
//
// HPC Ops Sprint — Priority 1 (Inquiry Authorization Protection), reframed
// against what the codebase already has (see HPC-Sprint-Audit-Checklist.md
// and sql/add_authorization_overrides.sql's header comment for the full
// reasoning). No new "authorized_inquiries" field or parallel "actual vs
// authorized" system — this reuses Priority 2's existing pieces:
//   - "Actual" = count_review_requests.ai_count (disputable count as of the
//     last classification save — utils/inquiryCounts.js#computeDisputePendingCounts)
//   - "Authorized" = clients.approved_{bureau}_count (only ever set by a
//     supervisor approval, or by an approver's own self-trusted save — see
//     utils/countReviewSync.js)
//
// Per the explicit decision on rollout: a bureau is only held once it has
// an established approved baseline (approved_count is NOT null) AND the
// current pending request's ai_count exceeds it. A client's very first
// pass — before anything has ever been approved — is never blocked, so
// today's normal workflow is unaffected; only a LATER overage (e.g. a
// report update surfaces new inquiries after a bureau was already approved
// once) requires fresh authorization before it can be marked complete
// again.

const BUREAUS = ["Experian", "TransUnion", "Equifax"];

// Maps a bureau name to the clients column carrying its supervisor-approved
// count. Single source of truth — useCountReviews.js imports this instead
// of keeping its own copy.
export const BUREAU_APPROVED_COLUMN = {
  Experian: "approved_exp_count",
  TransUnion: "approved_tu_count",
  Equifax: "approved_eq_count",
};

/**
 * True if this single bureau needs fresh authorization before it can be
 * marked complete again: there's a pending count_review_request for it, an
 * approved baseline already exists, and the pending count exceeds that
 * baseline.
 *
 * `client` needs approved_exp_count/approved_tu_count/approved_eq_count.
 * `pendingRequest` is `{ bureau, ai_count, status }` or undefined/null if
 * there's no pending request for this bureau right now.
 */
export function hasBureauOverage(client, pendingRequest) {
  if (!client || !pendingRequest || pendingRequest.status !== "pending") return false;
  const column = BUREAU_APPROVED_COLUMN[pendingRequest.bureau];
  if (!column) return false;

  const approvedCount = client[column];
  if (approvedCount == null) return false; // first pass — nothing established yet, don't block

  return Number(pendingRequest.ai_count) > Number(approvedCount);
}

/**
 * Given a client and every pending count_review_requests row for that
 * client (any shape with bureau/ai_count/status — e.g. straight from
 * Supabase), returns the list of bureaus currently on hold, each with the
 * numbers needed to display "Actual / Authorized / Additional Needed" and
 * to log an override.
 *
 * Returns `[]` if nothing is on hold.
 */
export function getClientAuthorizationHolds(client, pendingRequests = []) {
  const holds = [];
  for (const bureau of BUREAUS) {
    const request = (pendingRequests || []).find((r) => r.bureau === bureau && r.status === "pending");
    if (!request) continue;
    if (!hasBureauOverage(client, request)) continue;

    const column = BUREAU_APPROVED_COLUMN[bureau];
    const approvedCount = Number(client[column]) || 0;
    const actualCount = Number(request.ai_count) || 0;

    holds.push({
      bureau,
      requestId: request.id,
      actualCount,
      approvedCount,
      additionalNeeded: actualCount - approvedCount,
    });
  }
  return holds;
}

/**
 * Cheap boolean version for fleet-wide list views (Production Queue,
 * clientFlags.js) that only need to know IF a client has any hold, not the
 * per-bureau detail — avoids building the full holds array for every row.
 */
export function clientHasAuthorizationHold(client, pendingRequests = []) {
  return BUREAUS.some((bureau) => {
    const request = (pendingRequests || []).find((r) => r.bureau === bureau && r.status === "pending");
    return request && hasBureauOverage(client, request);
  });
}
