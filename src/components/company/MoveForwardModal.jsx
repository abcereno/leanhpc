// src/components/company/MoveForwardModal.jsx
//
// "Move Forward" — the one action that graduates a New Leads client
// (NewLeadsList.jsx) into an actual paid, working case. NewLeadForm.jsx
// deliberately only collects name/email/phone/credit-report up front, so
// by the time a lead is ready to move forward it's still missing exactly
// the things that would otherwise require a follow-up call: DOB, SSN,
// address, a service assignment, and the three ID documents. This modal
// collects all of it in one place, then marks the client paid using the
// same utils/markClientPaid.js the admin "New Leads" page
// (AdminNewLeads.jsx) uses — never a bare `.update({is_paid:true})` that
// would skip Document Routing enrollment/webhooks.
//
// Reuses CoverLetterAssets.jsx as-is (the same license/SSN/POA uploader
// already used on the admin client profile) instead of building a second
// upload flow — it only depends on supabase/useLogger/useToast, none of
// which are admin-specific, so it works unmodified from the company portal.
import { useState } from "react";
import { Modal, Button, Form, Row, Col, Spinner, Badge } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { SERVICES } from "../../utils/services";
import { markClientPaid } from "../../utils/markClientPaid";
import { useToast } from "../shared/ui/ToastNotifier";
import CoverLetterAssets from "../admin/client-profile/CoverLetterAssets";

export default function MoveForwardModal({ show, handleClose, client, onDone }) {
  const { addToast } = useToast();
  const [serviceId, setServiceId] = useState(client?.service_id || "");
  const [dob, setDob] = useState(client?.dob || "");
  const [ssn, setSsn] = useState("");
  const [address, setAddress] = useState(client?.address || "");
  const [assets, setAssets] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!client) return null;

  const checklist = [
    { label: "Service", done: !!serviceId },
    { label: "Address", done: !!address.trim() },
    { label: "Date of Birth", done: !!dob },
    { label: "SSN", done: !!ssn.trim() || !!client.ssn },
    { label: "Driver's License", done: !!assets.licenseUrl },
    { label: "SSN Card", done: !!assets.ssnUrl },
    { label: "Proof of Address", done: !!assets.poaUrl },
  ];

  const handleSubmit = async () => {
    if (!serviceId) {
      addToast({ title: "Service Required", message: "Choose a service before moving this client forward.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    if (!window.confirm(`Move ${client.full_name} forward? This marks them paid and starts their case.`)) return;

    setSubmitting(true);
    try {
      const service = SERVICES.find((s) => s.id === serviceId);
      const cleanSSN = ssn ? ssn.replace(/\D/g, "") : null;

      const { error: updateErr } = await supabase.from("clients").update({
        dispute_method: service.disputeMethod,
        service_id: service.id,
        dob: dob || null,
        ...(cleanSSN ? { ssn: cleanSSN } : {}),
        address: address.trim() || null,
      }).eq("id", client.id);
      if (updateErr) throw updateErr;

      const { error: paidErr } = await markClientPaid(client.id, { ...client, dispute_method: service.disputeMethod });
      if (paidErr) throw paidErr;

      addToast({ title: "Moved Forward", message: `${client.full_name} is now paid and in the ${service.label} queue.`, variant: "success", icon: "bi-check-circle" });
      onDone?.();
      handleClose();
    } catch (err) {
      console.error("Move forward failed:", err);
      addToast({ title: "Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold">
          <i className="bi bi-arrow-right-circle-fill me-2 text-success" />
          Move Forward — {client.full_name}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {checklist.map((item) => (
            <Badge key={item.label} bg={item.done ? "success" : "secondary"} className="fw-normal py-2 px-2">
              <i className={`bi ${item.done ? "bi-check-circle-fill" : "bi-circle"} me-1`} />
              {item.label}
            </Badge>
          ))}
        </div>

        <Row className="mb-3 g-2">
          <Col md={6}>
            <Form.Label className="fw-semibold">Service *</Form.Label>
            <Form.Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Select a service</option>
              {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Form.Select>
          </Col>
          <Col md={6}>
            <Form.Label className="fw-semibold">Date of Birth</Form.Label>
            <Form.Control type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          </Col>
        </Row>
        <Row className="mb-3 g-2">
          <Col md={6}>
            <Form.Label className="fw-semibold">SSN</Form.Label>
            <Form.Control placeholder={client.ssn ? "On file — enter to replace" : "XXX-XX-XXXX"} value={ssn} onChange={(e) => setSsn(e.target.value)} />
          </Col>
          <Col md={6}>
            <Form.Label className="fw-semibold">Address</Form.Label>
            <Form.Control value={address} onChange={(e) => setAddress(e.target.value)} />
          </Col>
        </Row>

        <div className="fw-bold small text-uppercase text-muted mb-2 mt-4">Identity Documents</div>
        <CoverLetterAssets clientId={client.id} onChange={setAssets} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button variant="success" className="fw-bold" onClick={handleSubmit} disabled={submitting || !serviceId}>
          {submitting ? <><Spinner size="sm" className="me-2" />Moving Forward…</> : "Move Forward — Mark as Paid"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
