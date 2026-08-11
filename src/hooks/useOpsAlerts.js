import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const DUE_TYPES = ["CALL_DUE_24H", "DOCS_DUE_24H", "FOLLOWUP_DUE_D7", "FOLLOWUP_REMINDER_D6"];
const OVERDUE_TYPES = [
  "CALL_OVERDUE_48H",
  "CALL_DAILY_OVERDUE",
  "DOCS_OVERDUE_48H",
  "DOCS_DAILY_OVERDUE",
  "FOLLOWUP_DAILY_OVERDUE",
];

/**
 * Open (uncleared) alerts_log rows, fleet-wide. This is the same table
 * IntakeDashboard.jsx already uses for call/docs/follow-up SLA tracking —
 * reused here so the Ops Dashboard's "Manager Attention" / "Action
 * Required" counts and Team Queue's due-today numbers stay consistent
 * with the Intake view instead of inventing a second alert source.
 *
 * Once Priority 1 ships, `AUTHORIZATION_HOLD` alerts should also flow
 * through this same table/hook (alert_type = 'AUTHORIZATION_HOLD').
 */
export default function useOpsAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("alerts_log")
        .select("id, client_id, alert_type, fired_date_et, delivered_channels, cleared_at")
        .is("cleared_at", null);
      if (err) throw err;
      setAlerts(data || []);
    } catch (e) {
      console.error("[useOpsAlerts] load error", e);
      setError(e.message || "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { alerts, loading, error, reload };
}

/**
 * Aggregates raw alert rows into due/overdue counts, and a per-client_id
 * lookup so a client card can show an "escalated" badge the same way
 * IntakeDashboard.jsx does (HOD:/MANAGER:/OWNER: prefixes in
 * delivered_channels).
 */
export function summarizeAlerts(alerts) {
  const dueCount = (alerts || []).filter((a) => DUE_TYPES.includes(a.alert_type)).length;
  const overdueCount = (alerts || []).filter((a) => OVERDUE_TYPES.includes(a.alert_type)).length;

  const escalatedClientIds = new Set();
  (alerts || []).forEach((a) => {
    const hasLeadership = (a.delivered_channels || []).some(
      (ch) => typeof ch === "string" && (ch.startsWith("HOD:") || ch.startsWith("MANAGER:") || ch.startsWith("OWNER:"))
    );
    if (hasLeadership || OVERDUE_TYPES.includes(a.alert_type)) {
      escalatedClientIds.add(a.client_id);
    }
  });

  const byClientId = new Map();
  (alerts || []).forEach((a) => {
    if (!byClientId.has(a.client_id)) byClientId.set(a.client_id, []);
    byClientId.get(a.client_id).push(a);
  });

  return { dueCount, overdueCount, escalatedClientIds, byClientId };
}
