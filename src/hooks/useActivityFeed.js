import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

const DEFAULT_LIMIT = 50;

/**
 * Live Activity Feed data source. Loads the most recent activity_logs rows
 * (the same table useLogger.js's logAction() already writes to from
 * dozens of places across the app) and subscribes to new inserts in
 * real time, matching the postgres_changes pattern already used by
 * ClientSubmissionListener.jsx / AdminNotificationWatcher.jsx.
 *
 * Pair with utils/activityFormatter.js#formatActivityEvent to render each
 * row.
 */
export default function useActivityFeed({ limit = DEFAULT_LIMIT } = {}) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const channelRef = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("activity_logs")
        .select("id, user_id, user_name, user_role, action_type, target_id, target_name, details, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (err) throw err;
      setEvents(data || []);
    } catch (e) {
      console.error("[useActivityFeed] load error", e);
      setError(e.message || "Failed to load activity feed");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (channelRef.current) return;

    const channel = supabase
      .channel("realtime:ops-activity-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs" },
        (payload) => {
          if (payload.new) {
            setEvents((prev) => [payload.new, ...prev].slice(0, limit));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [limit]);

  return { events, loading, error, reload };
}
