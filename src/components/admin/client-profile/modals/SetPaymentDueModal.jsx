// src/components/admin/client-profile/modals/SetPaymentDueModal.jsx
//
// Date-collection step for ClientHeader.jsx's "Set Payment Due Date"
// Status dropdown action. There's no recurring/subscription billing engine
// in this app (see sql/add_next_payment_due.sql's header comment) — this
// just lets staff set/clear a plain reminder date by hand, read back via
// utils/aging.js#getPaymentDueStatus and shown as a badge on the client
// profile, the Client Management list, and the Ops Pipeline.
import { useState } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";

export default function SetPaymentDueModal({ show, onClose, clientName, currentDate, onConfirm }) {
  // currentDate comes in as an ISO date string ("YYYY-MM-DD") or null —
  // Form.Control type="date" wants exactly that format already, no
  // reformatting needed either direction.
  const [date, setDate] = useState(currentDate || "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (clear = false) => {
    setSubmitting(true);
    try {
      await onConfirm(clear ? null : date || null);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">
          <i className="bi bi-calendar-event me-2 text-info" />
          Set Payment Due Date — {clientName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">
          A reminder date only — this doesn't charge or invoice the client automatically.
        </p>
        <Form.Label className="fw-semibold">Next Payment Due</Form.Label>
        <Form.Control
          type="date"
          autoFocus
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Modal.Body>
      <Modal.Footer>
        {currentDate && (
          <Button variant="outline-danger" className="me-auto" onClick={() => handleSubmit(true)} disabled={submitting}>
            Clear Date
          </Button>
        )}
        <Button variant="outline-secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" className="fw-bold" onClick={() => handleSubmit(false)} disabled={submitting || !date}>
          {submitting ? <><Spinner size="sm" className="me-2" />Saving…</> : "Save"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
