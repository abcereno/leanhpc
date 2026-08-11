import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { BUREAU_APPROVED_COLUMN } from "../utils/authorizationHold";

/**
 * HPC Ops Sprint Priority 2 (AI Count Quality Control) — the supervisor-side
 * queue. Realtime-subscribed the same way AdminServiceOrders.jsx already
 * does for client_service_requests.
 *
 * Requires sql/count_review.sql to have been run (count_review_requests /
 * count_review_approvals tables + the approve_count_reviews-gated RLS
 * policies) — without it, reload() will just error and callers should show
 * that rather than crash (same "migration might not be run yet" pattern
 * used throughout this project).
 */
export default function useCountReviews() {
  const { userId } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("count_review_requests")
      .select("*, clients(full_name, email), count_review_approvals(*)")
      .order("created_at", { ascending: false });
    if (err) {
      console.error("[useCountReviews] load error", err);
      setError(err.message);
      setRequests([]);
    } else {
      setRequests(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();

    const channel = supabase
      .channel("count-review-requests")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "count_review_requests" }, () => reload())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "count_review_requests" }, () => reload())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [reload]);

  /**
   * Writes the approval decision (append-only), updates
   * clients.approved_{bureau}_count, and flips the request to 'approved'.
   * Returns `hasPaidInvoice` so the caller can prompt "Recalculate Invoice?"
   * per the plan doc's pricing-protection note — this never auto-recomputes
   * billing itself.
   */
  const approveRequest = useCallback(async (request, approvedCount, supervisorInitials, largeDiffConfirmed) => {
    if (!request) return { success: false, error: "No request selected." };
    const column = BUREAU_APPROVED_COLUMN[request.bureau];
    if (!column) return { success: false, error: `Unknown bureau: ${request.bureau}` };
    if (!supervisorInitials?.trim()) return { success: false, error: "Initials are required." };

    const { error: approvalErr } = await supabase.from("count_review_approvals").insert({
      review_request_id: request.id,
      supervisor_id: userId,
      supervisor_initials: supervisorInitials.trim(),
      approved_count: approvedCount,
      large_diff_confirmed: !!largeDiffConfirmed,
    });
    if (approvalErr) return { success: false, error: approvalErr.message };

    const { error: clientErr } = await supabase
      .from("clients")
      .update({ [column]: approvedCount })
      .eq("id", request.client_id);
    if (clientErr) return { success: false, error: clientErr.message };

    const { error: statusErr } = await supabase
      .from("count_review_requests")
      .update({ status: "approved" })
      .eq("id", request.id);
    if (statusErr) return { success: false, error: statusErr.message };

    let hasPaidInvoice = false;
    try {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("id")
        .eq("client_id", request.client_id)
        .eq("payment_status", "Paid")
        .limit(1)
        .maybeSingle();
      hasPaidInvoice = !!invoice;
    } catch (e) {
      console.warn("[useCountReviews] Could not check for a paid invoice:", e);
    }

    await reload();
    return { success: true, hasPaidInvoice };
  }, [userId, reload]);

  const denyRequest = useCallback(async (request) => {
    if (!request) return { success: false };
    const { error: err } = await supabase
      .from("count_review_requests")
      .update({ status: "denied" })
      .eq("id", request.id);
    if (err) return { success: false, error: err.message };
    await reload();
    return { success: true };
  }, [reload]);

  return { requests, loading, error, reload, approveRequest, denyRequest };
}
