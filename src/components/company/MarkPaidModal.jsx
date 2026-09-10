// src/components/company/MarkPaidModal.jsx
//
// Lightweight alternative to MoveForwardModal for a lead that's already
// confirmed paid but doesn't have the full onboarding checklist ready yet
// (DOB, SSN, address, ID documents) — flips is_paid the same trusted way
// (utils/markClientPaid.js) so it still resets bureau statuses, creates
// the first Document Routing round, and fires the paid webhooks exactly
// like Move Forward does. A service is still required first, same
// guardrail Move Forward already has — dispute_method drives inquiry
// counting, document generation, and routing throughout the rest of the
// app, so this never marks a client paid without one.
import { useState } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { SERVICES } from "../../utils/services";
import { markClientPaid } from "../../utils/markClientPaid";
import { useToast } from "../shared/ui/ToastNotifier";
import { useConfirm } from "../shared/ui/ConfirmDialog";

export default function MarkPaidModal({ show, handleClose, client, onDone }) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [serviceId, setServiceId] = useState(client?.service_id || "");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!client) return null;

  const numericAmount = Number(amount);
  const amountValid = amount !== "" && Number.isFinite(numericAmount) && numericAmount > 0;

  const handleSubmit = async () => {
    if (!serviceId) {
      addToast({ title: "Service Required", message: "Choose a service before marking this client paid.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    // Amount paid is required — see markClientPaid.js's amount param,
    // which auto-records this as income so it shows up on the Financial
    // Dashboard without a separate manual "Add Income" step.
    if (!amountValid) {
      addToast({ title: "Amount Required", message: "Enter how much this client paid before marking them paid.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    if (!(await confirm(`Mark ${client.full_name} as paid ($${numericAmount.toFixed(2)})? This starts their case immediately.`))) return;

    setSubmitting(true);
    try {
      const service = SERVICES.find((s) => s.id === serviceId);

      if (serviceId !== client.service_id) {
        const { error: updateErr } = await supabase.from("clients").update({
          dispute_method: service.disputeMethod,
          service_id: service.id,
        }).eq("id", client.id);
        if (updateErr) throw updateErr;
      }

      const { error: paidErr } = await markClientPaid(client.id, { ...client, dispute_method: service.disputeMethod }, { amount: numericAmount });
      if (paidErr) throw paidErr;

      addToast({ title: "Marked Paid", message: `${client.full_name} is now paid and in the ${service.label} queue.`, variant: "success", icon: "bi-check-circle" });
      onDone?.();
      handleClose();
    } catch (err) {
      console.error("Mark paid failed:", err);
      addToast({ title: "Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">
          <i className="bi bi-cash-coin me-2 text-success" />
          Mark Paid — {client.full_name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">
          Skips the full onboarding checklist (DOB, SSN, address, ID documents) — use this when a client
          is already confirmed paid and you just need to flip the flag now. The rest can still be filled
          in later from their profile.
        </p>
        <Form.Label className="fw-semibold">Service *</Form.Label>
        <Form.Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="mb-3">
          <option value="">Select a service</option>
          {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Form.Select>

        <Form.Label className="fw-semibold">Amount Paid *</Form.Label>
        <Form.Control
          type="number"
          step="0.01"
          min="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Form.Text className="text-muted">Recorded automatically as income once this client is marked paid.</Form.Text>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button variant="success" className="fw-bold" onClick={handleSubmit} disabled={submitting || !serviceId || !amountValid}>
          {submitting ? <><Spinner size="sm" className="me-2" />Marking Paid…</> : "Mark Paid"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
