import { useState } from "react";
import { Modal, Button, Form } from "react-bootstrap";
import { supabase } from "../../../../supabaseClient";
import { useAuth } from "../../../../context/AuthContext";
import { useToast } from "../../../shared/ui/ToastNotifier";
import { handleImagePaste } from "../../../../utils/pasteImageUpload";
import FormatWithImages from "../../../shared/ui/FormatWithImages";

const BUCKET = "clients";

// Generic "check this box, log why" modal — reused by DocumentRouting.jsx
// for FTC / CFPB / Postalocity / Certified Postalocity. Each of those is a
// boolean prep-step column on document_routing (ftc_completed,
// cfpb_completed, postalocity_completed, certified_postalocity_completed);
// this modal doesn't know or care which one — the caller passes a `label`
// and flips its own field in `onLogged`, same division of responsibility
// LogDocumentModal.jsx already uses for the EXP/TU/EQ checkboxes.
//
// The log itself is posted straight into the client's Activity Thread
// (the `comments` table, rendered by CommentsSection.jsx) rather than a
// separate log table, per the client's explicit ask — one place ("the
// comments section") admins/partners already check for a client's history,
// instead of scattering per-checkbox logs across yet another table.
//
// `requireUpload` (DocumentRouting.jsx sets this for the FTC checkbox
// specifically) additionally requires a real file — previously the only
// way to attach evidence here was pasting a screenshot into the note,
// which was optional and just sat as a markdown-ish link inside a comment,
// nothing structured or queryable. With requireUpload, the file becomes a
// real client_documents row (doc_type: 'ftc_report'), the same storage
// pattern LetterEditorModal.jsx already uses for generated letters, so
// it's an actual document the AI alignment check (validate-document) can
// open and read — not just a note a human has to scroll to find.
export default function LogChecklistItemModal({ show, onClose, clientId, label, roundCount, onLogged, requireUpload = false }) {
  const { adminName, userId } = useAuth();
  const { addToast } = useToast();
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Same "append the uploaded screenshot's URL on a new line, don't wipe
  // whatever's already typed" pattern as EditClientModal.jsx's special-
  // notes field and CommentsSection.jsx's comment composer — all three
  // share utils/pasteImageUpload.js so a screenshot pasted here shows up
  // the same way once it lands in the Activity Thread.
  const handleNotePaste = (e) => {
    handleImagePaste(
      e,
      (url) => setNote((prev) => (prev ? `${prev}\n${url}` : url)),
      (err) => addToast({ title: "Image Upload Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" }),
      "checklist-log"
    );
  };

  const handleSubmit = async () => {
    if (requireUpload && !file) {
      addToast({ title: "Report Required", message: `Attach a photo or PDF of the ${label} before checking this box.`, variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    setSubmitting(true);
    const cleanNote = note.trim();

    // Upload first (if required) so a storage failure never leaves a
    // "marked complete" comment with nothing actually attached.
    if (requireUpload && file) {
      try {
        const ext = (file.name.split(".").pop() || "dat").toLowerCase();
        const storagePath = `${clientId}/ftc_reports/round-${roundCount || 0}-${Date.now()}.${ext}`;

        const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type || undefined });
        if (uploadErr) throw uploadErr;

        const { error: insertErr } = await supabase.from("client_documents").insert({
          client_id: clientId,
          file_name: `Round ${roundCount || "?"} - FTC Report`,
          file_url: storagePath,
          doc_type: "ftc_report",
          validation_status: "pending",
          uploaded_by: userId,
        });
        if (insertErr) throw insertErr;
      } catch (err) {
        setSubmitting(false);
        addToast({ title: "Upload Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
        return;
      }
    }

    const text = `✅ ${label}${roundCount ? ` — Round ${roundCount}` : ""} marked complete.${requireUpload ? " Report attached." : ""}${cleanNote ? ` ${cleanNote}` : ""}`;

    const { error } = await supabase.from("comments").insert([
      {
        client_id: clientId,
        text,
        author: adminName || "Admin",
      },
    ]);

    setSubmitting(false);

    if (error) {
      addToast({ title: "Log Failed", message: "Failed to post to Activity Thread: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    addToast({ title: "Logged", message: `${label} posted to the Activity Thread.`, variant: "success", icon: "bi-chat-left-text-fill" });

    if (onLogged) {
      try {
        onLogged();
      } catch (e) {
        console.error("onLogged callback error:", e?.message || e);
      }
    }

    setNote("");
    setFile(null);
    onClose();
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-check-circle me-2"></i>
          Log: {label}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {requireUpload && (
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">Report File *</Form.Label>
            <Form.Control
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="form-text">A photo or PDF of the actual FTC report — required to check this box.</div>
          </Form.Group>
        )}
        <Form.Group>
          <Form.Label>Notes (optional)</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            autoFocus
            placeholder="Any details worth noting — tracking number, who confirmed it, etc. Paste a screenshot (Ctrl+V) to attach it."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onPaste={handleNotePaste}
          />
        </Form.Group>
        {/\.(jpeg|jpg|gif|png|webp)/i.test(note) && (
          <div className="mt-2 border rounded p-2 bg-light">
            <FormatWithImages text={note} lineClassName="d-block" />
          </div>
        )}
        <div className="form-text mt-2">Posts to this client's Activity Thread and checks the box.</div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={submitting || (requireUpload && !file)}>
          {submitting ? "Saving..." : "Log & Check"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
