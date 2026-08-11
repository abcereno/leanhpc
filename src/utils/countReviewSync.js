// src/utils/countReviewSync.js
//
// Shared "queue this client's current dispute-pending count for supervisor
// review" logic. There are three places classifications get set and saved:
//   1. Admin panel — useInquiriesThread.js's saveUpdatedThread()
//   2. Individual portal — same hook (ProfileDashboard.jsx renders the same
//      <InquiriesThread> component the admin panel uses)
//   3. Partner company portal — InquirySelectionModal.jsx, which writes
//      thread.json directly and does NOT go through useInquiriesThread.js
// All three need to agree on what "needs a supervisor to confirm this
// number" means, so the sync logic lives here once instead of being
// duplicated (and potentially drifting) across all three call sites.
//
// No AI/OCR count is involved here — the number being queued for review is
// simply how many inquiries are currently classified Non-Linked/Associated/
// Dispute (see utils/inquiryCounts.js#computeDisputePendingCounts), i.e. the
// same count a human just set by classifying inquiries and hitting Save.

import { supabase } from "../supabaseClient";

/**
 * One pending count_review_requests row per (client, bureau) at a time:
 * refreshes the count on the existing pending row if it already differs,
 * inserts a fresh row if there isn't one yet, and leaves a bureau alone
 * entirely if it currently has nothing disputable (count 0).
 *
 * `disputeCounts` is the `{ Experian, TransUnion, Equifax }` shape returned
 * by computeDisputePendingCounts(). `actorId` is whichever auth.users id
 * performed the save (admin/employee, individual client, or company user) —
 * stored as count_review_requests.employee_id for the supervisor's context.
 */
export async function syncCountReviewRequests(clientId, disputeCounts, actorId) {
  if (!clientId) return;

  for (const bureau of ["Experian", "TransUnion", "Equifax"]) {
    const count = disputeCounts?.[bureau];
    if (!count) continue;

    const { data: existing, error: findErr } = await supabase
      .from("count_review_requests")
      .select("id, ai_count")
      .eq("client_id", clientId)
      .eq("bureau", bureau)
      .eq("status", "pending")
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing) {
      if (existing.ai_count !== count) {
        const { error: updErr } = await supabase
          .from("count_review_requests")
          .update({ ai_count: count, employee_id: actorId, created_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (updErr) throw updErr;
      }
    } else {
      const { error: insErr } = await supabase.from("count_review_requests").insert({
        client_id: clientId,
        bureau,
        ai_count: count,
        employee_id: actorId,
        reason: "classification_save",
      });
      if (insErr) throw insErr;
    }
  }
}

/**
 * The `clients.approved_{bureau}_count` payload for a save made by someone
 * who HOLDS approve_count_reviews — their own classification changes are
 * self-trusted and applied directly and immediately, every single save
 * (never frozen after a first value, unlike the old Phase 0 "default once"
 * behavior — an approver's number should always reflect what they just set).
 *
 * Callers WITHOUT approve_count_reviews must never call this — for them,
 * approved_*_count is exclusively supervisor-controlled (stays whatever was
 * last approved via the Count Review queue, or null/"Pending" if nobody has
 * reviewed yet) and their save should only call syncCountReviewRequests
 * above, never touch this column directly.
 */
export function buildApprovedCountsForApprover(disputeCounts) {
  return {
    approved_exp_count: disputeCounts.Experian,
    approved_tu_count: disputeCounts.TransUnion,
    approved_eq_count: disputeCounts.Equifax,
  };
}
