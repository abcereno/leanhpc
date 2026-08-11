// src/components/company/EditContactInfoModal.jsx
//
// Lets a company/partner portal user (company admin or agent, same access
// as viewing ClientProfilePage.jsx itself) update their client's contact
// info directly, instead of asking staff to do it. Deliberately scoped to
// email/phone/address only — see utils/partnerClientEdit.js's header for
// why identity fields (DOB, SSN) and anything workflow-driving
// (dispute_method, agent_id) stay out of this modal.
import { useEffect, useRef, useState } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";
import { updateClientContactInfo } from "../../utils/partnerClientEdit";
import { useToast } from "../shared/ui/ToastNotifier";

export default function EditContactInfoModal({ show, onHide, client, editor, onSaved }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ email: "", phone: "", address: "" });
  const [saving, setSaving] = useState(false);
  const prevShowRef = useRef(false);

  // Re-seed from the current client only on the actual closed->open
  // transition, not on every render where `show` happens to still be true.
  // The old deps array (`[show, client]`) reset the form on ANY re-render
  // that handed down a new `client` object reference — including a parent
  // re-render triggered by something unrelated (e.g. Supabase refreshing
  // the auth session when the browser tab regains focus, which cascades a
  // new `user` object through context and re-renders everything downstream
  // with a new `client` reference even though the client data itself
  // hasn't changed). That was silently wiping whatever the partner had
  // already typed. See AddClientModal.jsx for the same fix applied there.
  useEffect(() => {
    if (show && client && !prevShowRef.current) {
      setForm({
        email: client.email || "",
        phone: client.phone || "",
        address: client.address || "",
      });
    }
    prevShowRef.current = show;
  }, [show, client]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!form.email.trim()) {
      addToast({ title: "Email Required", message: "Client email can't be blank.", variant: "warning", icon: "bi-exclamation-circle" });
      return;
    }

    setSaving(true);
    const { error } = await updateClientContactInfo(
      client.id,
      { email: form.email.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null },
      editor
    );
    setSaving(false);

    if (error) {
      addToast({ title: "Save Failed", message: error.message, variant: "danger", icon: "bi-exclamation-triangle" });
      return;
    }

    addToast({ title: "Saved", message: "Contact info updated.", variant: "success", icon: "bi-check-circle" });
    onSaved?.();
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">
          <i className="bi bi-person-lines-fill me-2" />Edit Contact Info
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Email</Form.Label>
          <Form.Control type="email" name="email" value={form.email} onChange={handleChange} required />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Phone</Form.Label>
          <Form.Control type="tel" name="phone" value={form.phone} onChange={handleChange} />
        </Form.Group>
        <Form.Group>
          <Form.Label className="fw-semibold">Address</Form.Label>
          <Form.Control type="text" name="address" value={form.address} onChange={handleChange} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={saving}>Cancel</Button>
        <Button variant="primary" className="fw-bold" onClick={handleSave} disabled={saving}>
          {saving ? <><Spinner size="sm" className="me-2" />Saving…</> : "Save Changes"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
