import useClientNotes from "../../../hooks/useClientNotes";
import NoteComposer from "./NoteComposer";
import { useToast } from "../../shared/ui/ToastNotifier";

const NOTE_TYPES = [
  { key: "internal", label: "Internal", badge: "dark" },
  { key: "partner", label: "Partner", badge: "info" },
  { key: "client", label: "Client", badge: "success" },
];

/**
 * Manager Notes (Internal / Partner / Client, with pinning). Backed by the
 * new client_notes table (sql/client_notes.sql) — kept separate from
 * CommentsSection.jsx's "Activity Thread" (the `comments` table), which is
 * flat/single-type and already serving its own purpose.
 *
 * RLS on client_notes already excludes note_type='internal' from any
 * partner-portal query; this panel (internal admin UI) can read/write all
 * three types.
 */
export default function ManagerNotesPanel({ clientId }) {
  const { addToast } = useToast();
  const { notes, loading, error, migrationMissing, addNote, togglePin } = useClientNotes(clientId);

  const handleTogglePin = async (noteId, nextPinned) => {
    const res = await togglePin(noteId, nextPinned);
    if (res?.success) {
      addToast({ title: nextPinned ? "Pinned" : "Unpinned", message: nextPinned ? "Now shows in the Attention popup." : "Removed from the Attention popup.", variant: "success", icon: "bi-pin-fill" });
    } else {
      addToast({ title: "Action Failed", message: res?.error || "Could not update the pin.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  };

  if (migrationMissing) {
    return (
      <div className="card shadow-sm">
        <div className="card-body text-center py-4 text-muted">
          <i className="bi bi-database-exclamation fs-2 d-block mb-2 opacity-50"></i>
          Manager Notes isn't set up yet — ask an admin to run{" "}
          <code>sql/client_notes.sql</code> in Supabase.
        </div>
      </div>
    );
  }

  return (
    <div className="card shadow-sm">
      <div className="card-header">
        <h5 className="mb-0">
          <i className="bi bi-sticky me-2"></i>
          Manager Notes
        </h5>
      </div>

      <div className="card-body p-0">
        {loading ? (
          <div className="p-3 text-muted small">Loading…</div>
        ) : error ? (
          <div className="p-3 text-danger small">{error}</div>
        ) : notes.length === 0 ? (
          <div className="text-center py-4">
            <i className="bi bi-sticky fs-1 text-muted"></i>
            <p className="mt-2 mb-0">No notes yet</p>
          </div>
        ) : (
          <div className="p-3" style={{ maxHeight: 350, overflowY: "auto" }}>
            <div className="d-flex flex-column gap-2">
              {notes.map((n) => {
                const typeMeta = NOTE_TYPES.find((t) => t.key === n.note_type);
                return (
                  <div key={n.id} className={`border rounded p-2 ${n.is_pinned ? "border-warning bg-warning bg-opacity-10" : ""}`}>
                    <div className="d-flex justify-content-between align-items-start mb-1">
                      <div className="small">
                        <span className={`badge bg-${typeMeta?.badge || "secondary"} me-2`}>{typeMeta?.label || n.note_type}</span>
                        <strong>{n.author_name || "Unknown"}</strong>{" "}
                        <span className="text-muted">
                          ({new Date(n.created_at).toLocaleString()})
                        </span>
                      </div>
                      <button
                        className={`btn btn-sm p-0 ${n.is_pinned ? "text-warning" : "text-muted"}`}
                        title={n.is_pinned ? "Unpin" : "Pin"}
                        onClick={() => handleTogglePin(n.id, !n.is_pinned)}
                      >
                        <i className={`bi ${n.is_pinned ? "bi-pin-fill" : "bi-pin"}`}></i>
                      </button>
                    </div>
                    <div>{n.text}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="card-footer">
        <NoteComposer onAdd={addNote} pinnable />
      </div>
    </div>
  );
}
