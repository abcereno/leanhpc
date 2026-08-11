import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { getClientAuthorizationHolds } from "../utils/authorizationHold";

/**
 * Per-client version of the Priority 1 (Authorization Protection) hold
 * check used fleet-wide by utils/clientsData.js/clientFlags.js. A single
 * client profile (ClientHeader.jsx) needs the live, detailed holds list
 * (bureau/actual/approved/additionalNeeded) to gate the "Mark Complete"
 * actions and display the numbers — not just the boolean flag those bulk
 * views use.
 *
 * `client` must carry approved_exp_count/approved_tu_count/approved_eq_count
 * (already selected everywhere ClientHeader.jsx's useClient() reads from).
 */
export function useAuthorizationHolds(clientId, client) {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!clientId) { setPendingRequests([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("count_review_requests")
      .select("id, bureau, ai_count, status")
      .eq("client_id", clientId)
      .eq("status", "pending");
    if (error) {
      console.warn("[useAuthorizationHolds] Could not load pending count reviews:", error.message);
      setPendingRequests([]);
    } else {
      setPendingRequests(data || []);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { reload(); }, [reload]);

  const holds = useMemo(
    () => getClientAuthorizationHolds(client, pendingRequests),
    [client, pendingRequests]
  );

  return { holds, loading, refetch: reload };
}

export default useAuthorizationHolds;
