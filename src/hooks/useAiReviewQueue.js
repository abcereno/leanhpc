import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

/**
 * The "AI needs help" escalation queue — see sql/add_ai_review_queue.sql
 * and utils/aiReviewQueue.js#flagGuardedInquiries (the write side, called
 * from the two live classification save paths whenever
 * classify-inquiries's own deterministic guard downgrades a model call).
 *
 * Structurally mirrors useCountReviews.js: realtime-subscribed the same
 * way, same "migration might not be run yet" defensive error handling.
 */
export default function useAiReviewQueue() {
  const { userId } = useAuth();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("ai_review_queue")
      .select("*, clients(full_name, email)")
      .order("created_at", { ascending: false });
    if (err) {
      console.error("[useAiReviewQueue] load error", err);
      setError(err.message);
      setFlags([]);
    } else {
      setFlags(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();

    const channel = supabase
      .channel("ai-review-queue")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ai_review_queue" }, () => reload())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ai_review_queue" }, () => reload())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [reload]);

  const setStatus = useCallback(async (flag, status) => {
    if (!flag) return { success: false };
    const { error: err } = await supabase
      .from("ai_review_queue")
      .update({ status, resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq("id", flag.id);
    if (err) return { success: false, error: err.message };
    await reload();
    return { success: true };
  }, [userId, reload]);

  const resolveFlag = useCallback((flag) => setStatus(flag, "resolved"), [setStatus]);
  const dismissFlag = useCallback((flag) => setStatus(flag, "dismissed"), [setStatus]);

  return { flags, loading, error, reload, resolveFlag, dismissFlag };
}
