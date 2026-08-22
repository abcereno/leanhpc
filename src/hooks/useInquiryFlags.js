// src/hooks/useInquiryFlags.js
//
// Classic Report improvement #4 — "link No-Match inquiries into the dispute
// workflow." Two halves of the same feature, kept in one file since they
// share the table/shape (see sql/add_inquiry_flags.sql):
//   - submitInquiryFlags(): called from the unauthenticated
//     /classic-report/:token page (ClassicReportPage.jsx) when a client
//     checks off inquiries they don't recognize. No auth.uid() available —
//     RLS instead validates the client_id+source_token pair against a live
//     classic_report_token, same trust boundary the page's own report fetch
//     already uses.
//   - useFlaggedInquiries(): admin-side hook backing FlaggedInquiriesPanel.jsx
//     on the client profile, for reviewing/dismissing what clients flagged.
//
// Deliberately NOT writing into thread.json — that stays the admin-owned
// dispute-classification file (see useInquiriesThread.js). This queues a
// review row for a human to act on, same "flag now, human decides" shape as
// sql/count_review.sql's request/approval split.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/** Public — no auth required. `flags` is an array of
 * { creditor, bureau, date }. Returns { success, error }. */
export async function submitInquiryFlags(clientId, token, flags) {
  if (!clientId || !token || !flags?.length) return { success: false, error: "Nothing to submit." };
  const rows = flags.map((f) => ({
    client_id: clientId,
    source_token: token,
    creditor: f.creditor,
    bureau: f.bureau,
    inquiry_date: f.date || null,
  }));
  const { error } = await supabase.from("inquiry_flags").insert(rows);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Admin — lists pending/reviewed flags for a client, with mark-reviewed /
 * dismiss actions. Mirrors AlignmentCheckPanel.jsx's load/act/reload shape. */
export function useFlaggedInquiries(clientId, refreshKey) {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("inquiry_flags")
      .select("id, creditor, bureau, inquiry_date, note, status, created_at, reviewed_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error && /inquiry_flags/i.test(error.message || "")) {
      setMigrationMissing(true);
      setLoading(false);
      return;
    }
    setFlags(data || []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const setStatus = useCallback(async (id, status) => {
    setActingId(id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      await supabase
        .from("inquiry_flags")
        .update({ status, reviewed_by: userData?.user?.id || null, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      await load();
    } finally {
      setActingId(null);
    }
  }, [load]);

  const pendingCount = flags.filter((f) => f.status === "pending").length;

  return { flags, loading, migrationMissing, actingId, pendingCount, markReviewed: (id) => setStatus(id, "reviewed"), dismiss: (id) => setStatus(id, "dismissed"), reload: load };
}
