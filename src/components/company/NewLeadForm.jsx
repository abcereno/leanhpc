// src/components/company/NewLeadForm.jsx
//
// Partner-facing "Section 1" intake — deliberately minimal: name, email,
// phone, and a required credit report (SmartCredit login, IdentityIQ
// login, or an uploaded PDF — exactly one required, matching "LTOS needs
// it for counting inquiries and making bureau calls"). Everything else
// (SSN, DOB, address, service, agent, ID documents) is deliberately
// deferred to MoveForwardModal.jsx.
//
// Service used to be collected here too, but partners found the extra
// field confusing at intake time — reverted back to leaving
// dispute_method unassigned ("") on submit, same as before. Not null: an
// empty string still satisfies a NOT NULL constraint if one exists on this
// column, without matching any real service (see
// utils/services.js#serviceByDisputeMethod). This client won't match any
// of the 4 Client Management service tabs (ServiceClientList.jsx /
// InquiryRemovalClientList.jsx) until Move Forward assigns one — those
// tabs require is_paid===true AND a matching service, so this client shows
// up only on the "New Leads" tab (NewLeadsList.jsx) until then — see
// CompanyPortalDashboard.jsx.
//
// full_name is still a single column (see utils/clientDuplicateRound.js —
// splitting it into first/last name is a bigger schema change than this
// form alone), so the two name fields are just concatenated on submit.
import { useState } from "react";
import { Modal, Button, Form, Spinner, Row, Col, ButtonGroup } from "react-bootstrap";
import { useCompanyAuth } from "../../context/CompanyAuthContext";
import { supabase } from "../../supabaseClient";
import { resolveRoundForNewClient, insertClientRecord } from "../../utils/clientDuplicateRound";
import { runReportAutoImport } from "../../utils/reportAutoImport";
import { useToast } from "../shared/ui/ToastNotifier";

const REPORT_METHODS = [
  { key: "smartcredit", label: "SmartCredit Login" },
  { key: "idiq", label: "IdentityIQ Login" },
  { key: "upload", label: "Upload Credit Report (PDF)" },
];

export default function NewLeadForm({ show, handleClose, onClientAdded }) {
  const { companyId, user, isAgent } = useCompanyAuth();
  const { addToast } = useToast();

  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "" });
  const [reportMethod, setReportMethod] = useState(null);
  const [reportEmail, setReportEmail] = useState("");
  const [reportPassword, setReportPassword] = useState("");
  const [reportFile, setReportFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const resetForm = () => {
    setForm({ first_name: "", last_name: "", email: "", phone: "" });
    setReportMethod(null);
    setReportEmail("");
    setReportPassword("");
    setReportFile(null);
    setMessage("");
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const reportSatisfied =
    reportMethod === "upload" ? !!reportFile :
    reportMethod === "smartcredit" || reportMethod === "idiq" ? !!(reportEmail.trim() && reportPassword.trim()) :
    false;

  const canSubmit = form.first_name.trim() && form.last_name.trim() && form.email.trim() && form.phone.trim() && reportSatisfied;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setMessage("");

    try {
      const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.toUpperCase();

      const disputeRound = await resolveRoundForNewClient(form.email);
      if (disputeRound === null) {
        setMessage("Canceled — this email already belongs to an existing client.");
        setSubmitting(false);
        return;
      }

      const { data: clientData, error: clientError } = await insertClientRecord({
        full_name: fullName,
        email: form.email.trim(),
        phone: form.phone.trim(),
        dispute_round: disputeRound,
        // Left unassigned on purpose — see file header.
        dispute_method: "",
        company_id: companyId || null,
        agent_id: isAgent ? user?.id || null : null,
        // Persisted on the client row itself (not just used transiently
        // below) so ClientHeader.jsx's "Credit Logins" badges and any
        // later retry (Fetch3bModal.jsx) have them — matching how
        // AddClientForm.jsx's report credentials fields already work.
        report_email: (reportMethod === "smartcredit" || reportMethod === "idiq") ? reportEmail.trim() || null : null,
        report_password: (reportMethod === "smartcredit" || reportMethod === "idiq") ? reportPassword.trim() || null : null,
      }, { select: "id" });

      if (clientError || !clientData) {
        setMessage(`Error adding client: ${clientError?.message || "unknown error"}`);
        setSubmitting(false);
        return;
      }

      const clientId = clientData.id;

      if (reportMethod === "upload" && reportFile) {
        try {
          const fileExt = (reportFile.name.split(".").pop() || "pdf").toLowerCase();
          const path = `${clientId}/credit_report_upload.${fileExt}`;
          const { error: upErr } = await supabase.storage.from("clients").upload(path, reportFile, { upsert: true });
          if (upErr) throw upErr;
          const { data: { publicUrl } } = supabase.storage.from("clients").getPublicUrl(path);
          await supabase.from("client_documents").insert([{
            client_id: clientId,
            file_name: "credit_report_upload",
            file_url: publicUrl,
            uploaded_by: user?.id || null,
          }]);
        } catch (fileErr) {
          console.error("Credit report upload failed:", fileErr);
          addToast({ title: "Client Saved, Upload Failed", message: `Credit report upload failed: ${fileErr.message}. You can upload it again from the client's profile.`, variant: "warning", icon: "bi-exclamation-triangle-fill", timeout: 9000 });
        }
      } else if (reportMethod === "smartcredit" || reportMethod === "idiq") {
        try {
          await runReportAutoImport(reportMethod, clientId, { email: reportEmail.trim(), password: reportPassword.trim() }, "Partner Portal");
        } catch (fetchErr) {
          console.error("Auto-fetch error:", fetchErr);
          addToast({ title: "Client Saved, Import Failed", message: `Report import failed: ${fetchErr.message}. Logins may be invalid — verify and retry on their profile.`, variant: "warning", icon: "bi-exclamation-triangle-fill", timeout: 9000 });
        }
      }

      addToast({ title: "Lead Added", message: `${fullName} was added to New Leads, awaiting payment.`, variant: "success", icon: "bi-person-check-fill" });
      resetForm();
      onClientAdded?.();
      handleClose();
    } catch (err) {
      console.error(err);
      setMessage(`Error adding client: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={() => { resetForm(); handleClose(); }} centered>
      <Modal.Header closeButton>
        <Modal.Title className="h5 fw-bold"><i className="bi bi-person-plus me-2" />New Lead</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <Row className="mb-3 g-2">
            <Col md={6}>
              <Form.Label className="fw-semibold">First Name *</Form.Label>
              <Form.Control name="first_name" value={form.first_name} onChange={handleChange} required />
            </Col>
            <Col md={6}>
              <Form.Label className="fw-semibold">Last Name *</Form.Label>
              <Form.Control name="last_name" value={form.last_name} onChange={handleChange} required />
            </Col>
          </Row>
          <Row className="mb-3 g-2">
            <Col md={6}>
              <Form.Label className="fw-semibold">Email *</Form.Label>
              <Form.Control type="email" name="email" value={form.email} onChange={handleChange} required />
            </Col>
            <Col md={6}>
              <Form.Label className="fw-semibold">Phone *</Form.Label>
              <Form.Control type="tel" name="phone" value={form.phone} onChange={handleChange} required />
            </Col>
          </Row>

          <div className="p-3 border rounded bg-light">
            <div className="fw-bold small text-uppercase text-muted mb-2">Credit Report — one required</div>
            <ButtonGroup className="w-100 mb-3">
              {REPORT_METHODS.map((m) => (
                <Button
                  key={m.key}
                  variant={reportMethod === m.key ? "primary" : "outline-secondary"}
                  onClick={() => setReportMethod(m.key)}
                  size="sm"
                >
                  {m.label}
                </Button>
              ))}
            </ButtonGroup>

            {(reportMethod === "smartcredit" || reportMethod === "idiq") && (
              <Row className="g-2">
                <Col md={6}>
                  <Form.Control placeholder="Report Email" type="email" value={reportEmail} onChange={(e) => setReportEmail(e.target.value)} />
                </Col>
                <Col md={6}>
                  <Form.Control placeholder="Report Password" type="password" value={reportPassword} onChange={(e) => setReportPassword(e.target.value)} />
                </Col>
              </Row>
            )}

            {reportMethod === "upload" && (
              <Form.Control type="file" accept="application/pdf" onChange={(e) => setReportFile(e.target.files?.[0] || null)} />
            )}

            {!reportMethod && <div className="small text-muted">Choose how the credit report will be provided.</div>}
          </div>

          {message && <div className="alert alert-danger mt-3 mb-0 small">{message}</div>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => { resetForm(); handleClose(); }} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="primary" className="fw-bold" disabled={!canSubmit || submitting}>
            {submitting ? <><Spinner size="sm" className="me-2" />Adding…</> : "Add Lead"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
