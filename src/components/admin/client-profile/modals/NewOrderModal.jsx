// src/components/admin/client-profile/modals/NewOrderModal.jsx
//
// Service-picker step for ClientHeader.jsx's "+ New Order" Tools action
// (Phase 3 of Client/Order/Round separation — see
// sql/add_client_identity_orders.sql and useClientActions.js#startNewOrder
// for the full picture). Same shape as MarkPaidAmountModal.jsx — a single
// required field, then hand off to the action.
//
// Defaults the picker to the client's CURRENT service, matching the task
// spec's "prefilled from latest round" — staff can leave it as-is (which
// behaves identically to "Start New Round": same service, same order,
// next round) or pick a different service, which is what actually starts
// a brand-new order for this same person.
import { useState } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";
import { SERVICES } from "../../../../utils/services";

export default function NewOrderModal({ show, onClose, clientName, currentServiceId, onConfirm }) {
  const [serviceId, setServiceId] = useState(currentServiceId || SERVICES[0]?.id || "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!serviceId) return;
    setSubmitting(true);
    try {
      const newClientId = await onConfirm(serviceId);
      if (newClientId) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">
          <i className="bi bi-folder-plus me-2 text-warning" />
          New Order — {clientName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">
          Starts a brand-new service engagement for this same person. Their personal info and identity
          documents (ID, proof of address, authorization) carry over — the credit report, inquiry counts,
          payment status, and progress do not, same as any other new client.
        </p>
        <Form.Label className="fw-semibold">Service *</Form.Label>
        <Form.Select
          autoFocus
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
        >
          {SERVICES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}{s.id === currentServiceId ? " (current)" : ""}</option>
          ))}
        </Form.Select>
        <Form.Text className="text-muted">
          Picking the client's current service behaves just like "Start New Round" — same order, next round.
          Picking a different one starts a separate order for this person.
        </Form.Text>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="warning" className="fw-bold" onClick={handleSubmit} disabled={submitting || !serviceId}>
          {submitting ? <><Spinner size="sm" className="me-2" />Starting…</> : "Start New Order"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
