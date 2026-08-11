import { useState } from "react";
import { useToast } from "../../shared/ui/ToastNotifier";

const NOTE_TYPES = [
  { key: "internal", label: "Internal", badge: "dark" },
  { key: "partner", label: "Partner", badge: "info" },
  { key: "client", label: "Client", badge: "success" },
];

/**
 * The "pick a type, write a note, submit" composer shared by
 * ManagerNotesPanel.jsx (the Manager Notes tab) and the Attention popup in
 * ClientProfile.jsx — both add rows to the same client_notes table via
 * useClientNotes' addNote(), so the input UI only needs to exist once.
 *
 * `pinnable`: shows a "Pin as important" checkbox so a note can be flagged
 * right when it's written (used in the Attention popup, where the whole
 * point is surfacing something important) — off by default for the plain
 * Manager Notes tab, where pinning an existing note is a separate action.
 */
export default function NoteComposer({ onAdd, defaultType = "internal", submitLabel = "Add Note", pinnable = false }) {
  const { addToast } = useToast();
  const [text, setText] = useState("");
  const [noteType, setNoteType] = useState(defaultType);
  const [pinned, setPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    const res = await onAdd(text, noteType, pinned);
    setSubmitting(false);
    if (res?.success) {
      setText("");
      setPinned(false);
      addToast({ title: "Note Added", message: pinned ? "Pinned and saved." : "Saved.", variant: "success", icon: "bi-sticky-fill" });
    } else {
      addToast({ title: "Note Failed", message: res?.error || "Could not save the note.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  };

  return (
    <div>
      <div className="mb-2 d-flex gap-2 flex-wrap">
        {NOTE_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`btn btn-sm ${noteType === t.key ? `btn-${t.badge}` : `btn-outline-${t.badge}`}`}
            onClick={() => setNoteType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <textarea
        className="form-control mb-2"
        rows="2"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Write a ${noteType} note…`}
      />
      {pinnable && (
        <div className="form-check mb-2">
          <input
            className="form-check-input"
            type="checkbox"
            id="note-composer-pin"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />
          <label className="form-check-label small" htmlFor="note-composer-pin">
            Pin as important — shows in the Attention popup for the next person who opens this client
          </label>
        </div>
      )}
      <button className="btn btn-success w-100" onClick={handleAdd} disabled={submitting || !text.trim()}>
        {submitting ? (
          <span className="spinner-border spinner-border-sm me-2" role="status" />
        ) : (
          <i className="bi bi-send me-2"></i>
        )}
        {submitLabel}
      </button>
    </div>
  );
}
