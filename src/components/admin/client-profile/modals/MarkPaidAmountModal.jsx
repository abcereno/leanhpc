// src/components/admin/client-profile/modals/MarkPaidAmountModal.jsx
//
// Amount-collection step for ClientHeader.jsx's "Mark as Paid" Status
// dropdown action. Service is already assigned by the time a client has
// their own profile (unlike AdminNewLeads.jsx / MoveForwardModal.jsx,
// which still need a service picker) — this only needs to collect and
// require the payment amount, then hand off to
// useClientActions.js#markAsPaid, which passes it into
// utils/markClientPaid.js to auto-record it as income.
import { useState } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";

export default function MarkPaidAmountModal({ show, onClose, clientName, onConfirm }) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const numericAmount = Number(amount);
  const amountValid = amount !== "" && Number.isFinite(numericAmount) && numericAmount > 0;

  const handleSubmit = async () => {
    if (!amountValid) return;
    setSubmitting(true);
    try {
      const ok = await onConfirm(numericAmount);
      if (ok) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">
          <i className="bi bi-currency-dollar me-2 text-success" />
          Mark as Paid — {clientName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">
          This initializes the client in the Document Routing queue and resets bureau statuses.
        </p>
        <Form.Label className="fw-semibold">Amount Paid *</Form.Label>
        <Form.Control
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0.00"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && amountValid) handleSubmit(); }}
        />
        <Form.Text className="text-muted">Recorded automatically as income once marked paid.</Form.Text>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="success" className="fw-bold" onClick={handleSubmit} disabled={submitting || !amountValid}>
          {submitting ? <><Spinner size="sm" className="me-2" />Marking Paid…</> : "Mark Paid"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
