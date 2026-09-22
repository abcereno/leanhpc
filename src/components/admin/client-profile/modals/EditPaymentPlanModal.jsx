// src/components/admin/client-profile/modals/EditPaymentPlanModal.jsx
//
// Edits the plain, staff-set payment-plan fields (sql/add_payment_plan.sql)
// plus the existing next_payment_due_at reminder date, all in one place —
// opened from ClientBillingPanel.jsx's "Edit Billing Info" button. Doesn't
// touch what's actually been paid so far; that's derived read-only from the
// `incomes` table (see utils/clientPayments.js) and shown alongside this
// modal's fields in the panel, not editable here.
import { useState } from "react";
import { Modal, Button, Form, Spinner, Row, Col } from "react-bootstrap";

export default function EditPaymentPlanModal({ show, onClose, clientName, initial, onConfirm }) {
  const [totalAmountDue, setTotalAmountDue] = useState(initial?.total_amount_due ?? "");
  const [installments, setInstallments] = useState(initial?.payment_plan_installments ?? "");
  const [planAmount, setPlanAmount] = useState(initial?.payment_plan_amount ?? "");
  const [dueDate, setDueDate] = useState(initial?.next_payment_due_at ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onConfirm({
        total_amount_due: totalAmountDue === "" ? null : Number(totalAmountDue),
        payment_plan_installments: installments === "" ? null : Number(installments),
        payment_plan_amount: planAmount === "" ? null : Number(planAmount),
        next_payment_due_at: dueDate || null,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">
          <i className="bi bi-cash-stack me-2 text-info" />
          Billing & Payment Plan — {clientName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">
          Plain reference fields — this doesn't charge or invoice the client automatically. Amount paid so far is tracked separately from actual recorded payments.
        </p>
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Total Amount Due ($)</Form.Label>
          <Form.Control
            type="number"
            min="0"
            step="0.01"
            placeholder="e.g. 1200"
            value={totalAmountDue}
            onChange={(e) => setTotalAmountDue(e.target.value)}
          />
        </Form.Group>
        <Row>
          <Col>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold"># Payments Required</Form.Label>
              <Form.Control
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 4"
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </Form.Group>
          </Col>
          <Col>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Amount / Payment ($)</Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 300"
                value={planAmount}
                onChange={(e) => setPlanAmount(e.target.value)}
              />
            </Form.Group>
          </Col>
        </Row>
        <Form.Group>
          <Form.Label className="fw-semibold">Next Payment Due</Form.Label>
          <Form.Control type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="primary" className="fw-bold" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <><Spinner size="sm" className="me-2" />Saving…</> : "Save"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
