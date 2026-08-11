import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

// Local YYYY-MM-DD, matching the convention utils/dateHelpers.js already
// uses to avoid UTC-shift bugs against date-only DB columns.
function localDateStr(d = new Date()) {
  return d.toLocaleDateString("en-CA");
}

/**
 * Activity Metrics for the Ops Dashboard. Takes the already-loaded `clients`
 * array (from useOpsSummary) rather than re-querying clients itself — only
 * call_logs (which useOpsSummary doesn't fetch) is loaded here.
 *
 * `dateRange` is `{ from, to }` (YYYY-MM-DD strings, either side optional).
 * Defaults to "today" on both ends so this behaves exactly as it did before
 * date-range filtering existed if the caller doesn't pass one.
 *
 * `avgProcessingDays` is deliberately NOT affected by `dateRange` — it's a
 * current-state average over clients still in production right now, not a
 * count of things that happened in a window (same reasoning as the
 * current-state cards in utils/opsMetrics.js#computeCompanySnapshot).
 *
 * "Count Review Requests" from the spec's Daily Metrics list is
 * intentionally omitted — it depends on the count_review_requests table
 * from Priority 2, which doesn't exist yet. Add it here once that ships.
 */
export default function useDailyMetrics(clients, dateRange) {
  const today = localDateStr();
  const from = dateRange?.from ?? today;
  const to = dateRange?.to ?? today;

  const [callLogsInRange, setCallLogsInRange] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("call_logs")
        .select("id, call_date, exp_start_time, tu_start_time, eq_start_time");
      if (from) query = query.gte("call_date", from);
      if (to) query = query.lte("call_date", to);

      const { data, error: err } = await query;
      if (err) throw err;
      setCallLogsInRange(data || []);
    } catch (e) {
      console.error("[useDailyMetrics] load error", e);
      setError(e.message || "Failed to load daily metrics");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    reload();
  }, [reload]);

  const metrics = useMemo(() => {
    const inRange = (iso) => {
      if (!iso) return false;
      const d = String(iso).slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    };

    const list = clients || [];
    const newClients = list.filter((c) => inRange(c.created_at)).length;
    const completed = list.filter((c) => inRange(c.date_completed)).length;
    const payments = list.filter((c) => inRange(c.paid_at)).length;

    const experianCalls = callLogsInRange.filter((r) => r.exp_start_time).length;
    const tuSubmissions = callLogsInRange.filter((r) => r.tu_start_time).length;
    const eqSubmissions = callLogsInRange.filter((r) => r.eq_start_time).length;

    const paidActive = list.filter((c) => c.is_paid && !c.bureausAllDone);
    const avgProcessingDays = paidActive.length
      ? Math.round(
          (paidActive.reduce((sum, c) => sum + (c.paidRunningDays || 0), 0) / paidActive.length) * 10
        ) / 10
      : 0;

    return {
      newClients,
      completed,
      experianCalls,
      tuSubmissions,
      eqSubmissions,
      payments,
      avgProcessingDays,
    };
  }, [clients, callLogsInRange, from, to]);

  return { metrics, loading, error, reload };
}
