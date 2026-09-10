import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

/**
 * CRUD for the client_notes table (Manager Notes: internal / partner /
 * client, with pinning). See sql/client_notes.sql — that migration must be
 * run before this hook will work.
 *
 * Until it's run, every call fails with a Postgres "relation ... does not
 * exist" error; this hook catches that specific case and sets
 * `migrationMissing = true` instead of surfacing a raw error, so calling
 * UI can show "ask an admin to run the Manager Notes migration" rather
 * than a crash.
 */
export default function useClientNotes(clientId) {
  const { userId, fullName } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const reload = useCallback(async () => {
    if (!clientId) {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("client_notes")
        .select("id, client_id, note_type, is_pinned, author_id, author_name, text, created_at, gap_key")
        .eq("client_id", clientId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (err) throw err;
      setNotes(data || []);
      setMigrationMissing(false);
    } catch (e) {
      console.error("[useClientNotes] load error", e);
      if (String(e.message || "").toLowerCase().includes("does not exist")) {
        setMigrationMissing(true);
      } else {
        setError(e.message || "Failed to load notes");
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // `gapKey` tags this note as the reason for a specific Operational
  // Timeline gap (ClientSummaryModal.jsx) rather than an ordinary Manager
  // Note — see src/utils/timelineGapNotes.js. Omit/null for a normal note.
  const addNote = useCallback(
    async (text, noteType = "internal", pinned = false, gapKey = null) => {
      if (!clientId || !text?.trim()) return { success: false };
      const { data, error: err } = await supabase
        .from("client_notes")
        .insert({
          client_id: clientId,
          note_type: noteType,
          is_pinned: !!pinned,
          text: text.trim(),
          author_id: userId,
          author_name: fullName,
          gap_key: gapKey || null,
        })
        .select()
        .single();

      if (err) {
        console.error("[useClientNotes] add error", err);
        return { success: false, error: err.message };
      }
      setNotes((prev) =>
        [data, ...prev].sort((a, b) => (b.is_pinned === a.is_pinned ? 0 : b.is_pinned ? 1 : -1))
      );
      return { success: true, note: data };
    },
    [clientId, userId, fullName]
  );

  const togglePin = useCallback(async (noteId, nextPinned) => {
    const { error: err } = await supabase
      .from("client_notes")
      .update({ is_pinned: nextPinned })
      .eq("id", noteId);

    if (err) {
      console.error("[useClientNotes] pin error", err);
      return { success: false, error: err.message };
    }
    setNotes((prev) =>
      [...prev]
        .map((n) => (n.id === noteId ? { ...n, is_pinned: nextPinned } : n))
        .sort((a, b) => (b.is_pinned === a.is_pinned ? 0 : b.is_pinned ? 1 : -1))
    );
    return { success: true };
  }, []);

  return { notes, loading, error, migrationMissing, reload, addNote, togglePin };
}
