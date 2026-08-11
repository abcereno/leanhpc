import { useState } from "react";
import { Modal, Button, Form, Alert, Table } from "react-bootstrap";
import { supabase } from "../../../../supabaseClient";
import { useAuth } from "../../../../context/AuthContext";
import { useToast } from "../../../shared/ui/ToastNotifier";

// HPC Ops Sprint — Priority 1 (Inquiry Authorization Protection). Shown
// instead of letting "Mark [Bureau] Complete" proceed when
// utils/authorizationHold.js#getClientAuthorizationHolds finds one or more
// bureaus whose disputable count has grown past what's already been
// approved via Count Review. Only reachable by someone with the
// override_authorization_hold permission (gated by the caller, ClientHeader.jsx,
// before this modal is even offered — non-holders instead see a blocking
// toast pointing them at the Count Review queue).
//
// Writes one permanent, append-only authorization_overrides row per held
// bureau being overridden (all sharing the same reason/initials/timestamp),
// per the spec's "reason + manager initials + date/time, permanently
// logged" requirement — see sql/add_authorization_overrides.sql.
export default function ManagerOverrideModal({ show, onClose, clientId, clientName, holds = [], onOverridden }) {
  const { userId } = useAuth();
  const { addToast } = useToast();

  const [reason, setReason] = useState("");
  const [initials, setInitials] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setReason("");
    setInitials("");
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    if (!initials.trim()) {
      setError("Manager initials are required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const rows = holds.map((h) => ({
      client_id: clientId,
      bureau: h.bureau,
      ai_count: h.actualCount,
      approved_count: h.approvedCount,
      reason: reason.trim(),
      manager_id: userId || null,
      manager_initials: initials.trim(),
    }));

    const { error: insertErr } = await supabase.from("authorization_overrides").insert(rows);

    setSubmitting(false);

    if (insertErr) {
      setError(insertErr.message || "Failed to save override.");
      addToast({ title: "Override Failed", message: insertErr.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    addToast({
      title: "Authorization Override Logged",
      message: `${holds.map((h) => h.bureau).join(", ")} overridden for ${clientName || "this client"}.`,
      variant: "warning",
      icon: "bi-shield-exclamation",
    });

    reset();
    if (onOverridden) await onOverridden();
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton className="bg-danger text-white border-0">
        <Modal.Title className="fs-6 fw-bold">
          <i className="bi bi-shield-exclamation me-2"></i>Manager Override — Authorization Hold
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="danger" className="small py-2 mb-3">
          <strong>{clientName || "This client"}</strong> has more inquiries pending than what a supervisor has
          approved via Count Review. Overriding will let this proceed anyway and is permanently logged.
        </Alert>

        <Table size="sm" bordered className="mb-3">
          <thead className="table-light">
            <tr>
              <th>Bureau</th>
              <th className="text-end">Actual</th>
              <th className="text-end">Approved</th>
              <th className="text-end">Additional Needed</th>
            </tr>
          </thead>
          <tbody>
            {holds.map((h) => (
              <tr key={h.bureau}>
                <td>{h.bureau}</td>
                <td className="text-end">{h.actualCount}</td>
                <td className="text-end">{h.approvedCount}</td>
                <td className="text-end text-danger fw-bold">+{h.additionalNeeded}</td>
              </tr>
            ))}
          </tbody>
        </Table>

        {error && <Alert variant="danger" className="small py-2">{error}</Alert>}

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small text-uppercase text-muted">Reason <span className="text-danger">*</span></Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is it okay to proceed before Count Review approves this?"
            disabled={submitting}
          />
        </Form.Group>

        <Form.Group>
          <Form.Label className="fw-bold small text-uppercase text-muted">Manager Initials <span className="text-danger">*</span></Form.Label>
          <Form.Control
            value={initials}
            onChange={(e) => setInitials(e.target.value)}
            placeholder="e.g. BC"
            disabled={submitting}
            style={{ maxWidth: 160 }}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button variant="danger" className="fw-bold" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving..." : "Override & Proceed"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
