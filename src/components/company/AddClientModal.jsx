import { useEffect, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useCompanyAuth } from '../../context/CompanyAuthContext';
import { Modal, Button, Form, Spinner, Alert, Row, Col, Badge, InputGroup } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import CoverLetterAssetsLTOS from '../shared/client-pages/CoverLetterAssetsLTOS';
import useLogger from "../../hooks/useLogger";
import { resolveRoundForNewClient, insertClientRecord } from "../../utils/clientDuplicateRound";
import { SERVICES } from "../../utils/services";
import { runReportAutoImport } from "../../utils/reportAutoImport";
import { useToast } from "../shared/ui/ToastNotifier";
import { useConfirm } from "../shared/ui/ConfirmDialog";
import useDropzone from "../../hooks/useDropzone";

const fileKey = (f) => `${f.name}-${f.size}-${f.lastModified}`;

export default function AddClientModal({ show, handleClose, onClientAdded }) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const { companyId, user, fullName, isAgent, agentCode } = useCompanyAuth(); 
  const logAction = useLogger(); 
  const navigate = useNavigate(); 
  const displayFullName = fullName || user?.user_metadata?.full_name || user?.email || "Unknown";
  
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", dob: "", ssn: "", address: "",
    logins_notes: "", special_forms_notes: "", dispute_method: "inquiry deletion",
    agent_id: "", has_recent_apps: false, recent_apps_notes: "",
    has_special_instructions: false, special_instructions_notes: "",
    identityUrl: "", addressUrl: "", authorizationUrl: "",
    report_email: "", report_password: ""
  });

  const [companyAgents, setCompanyAgents] = useState([]);
  const [createdClientId, setCreatedClientId] = useState(null);
  const [message, setMessage] = useState("");
  
  const [file, setFile] = useState([]);
  const fileInputRef = useRef(null);
  
  const [screenshots, setScreenshots] = useState([]); 
  const screenshotInputRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [companyName, setCompanyName] = useState("");
  // Which report provider the report_email/report_password fields below
  // belong to — see utils/reportAutoImport.js (shared with AddClientForm.jsx,
  // the public/company /add-clients page).
  const [reportProvider, setReportProvider] = useState("smartcredit");
  // IDIQ-only, optional per ParseRreportModal.jsx ("PIN/SSN if required") —
  // not persisted to the clients row (matching ParseRreportModal.jsx, which
  // also never saves these; they're only used for this one fetch attempt).
  const [reportPin, setReportPin] = useState("");
  const [reportSsn, setReportSsn] = useState("");

  const isTrusted = companyName?.toLowerCase().includes("trusted");

const prevShowRef = useRef(false);

  useEffect(() => {
    // Only run this block the exact moment the modal transitions from closed to open
    if (show && !prevShowRef.current) {
      const fetchData = async () => {
         if (!companyId) return;
         const { data: co } = await supabase.from("companies").select("company_name").eq("id", companyId).single();
         if (co) setCompanyName(co.company_name);

         if (!isAgent) {
            const { data: agents } = await supabase
              .from("company_user_profiles")
              .select("id, full_name, agent_code") 
              .eq("company_id", companyId)
              .in("role", ["agent", "company_agent"]); 
            if (agents) setCompanyAgents(agents);
         }
      };
      fetchData();

      setForm({
        full_name: "", email: "", phone: "", dob: "", ssn: "", address: "",
        logins_notes: "", special_forms_notes: "", dispute_method: "inquiry deletion",
        agent_id: user?.id || "", has_recent_apps: false, recent_apps_notes: "",
        has_special_instructions: false, special_instructions_notes: "",
        identityUrl: "", addressUrl: "", authorizationUrl: "",
        report_email: "", report_password: ""
      });
      setFile([]);
      setScreenshots([]);
      setMessage("");
      setUploading(false);
      setCreatedClientId(null);
      setShowPassword(false);
      setReportProvider("smartcredit");
      setReportPin("");
      setReportSsn("");
      if (fileInputRef.current) fileInputRef.current.value = null;
      if (screenshotInputRef.current) screenshotInputRef.current.value = null;
    }
    prevShowRef.current = show;
  }, [show, companyId, user?.id, isAgent]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === "has_recent_apps") {
      setForm((prev) => ({ ...prev, has_recent_apps: value === "yes", recent_apps_notes: value === "no" ? "" : prev.recent_apps_notes }));
    } else if (name === "has_special_instructions") {
      setForm((prev) => ({ ...prev, has_special_instructions: value === "yes", special_instructions_notes: value === "no" ? "" : prev.special_instructions_notes }));
    } else if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handlePasteScreenshot = (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;
    const pastedFiles = clipboardData.files;
    let imagePasted = false;

    if (pastedFiles && pastedFiles.length > 0) {
      for (let i = 0; i < pastedFiles.length; i++) {
        const file = pastedFiles[i];
        if (file.type.startsWith('image/')) {
          imagePasted = true;
          const newFile = new File([file], `screenshot-${Date.now()}-${i}.png`, { type: file.type });
          setScreenshots((prev) => [...prev, newFile]);
        }
      }
    }
    if (imagePasted) e.preventDefault();
  };

  const handleScreenshotSelect = (e) => {
    const picked = Array.from(e.target.files || []);
    setScreenshots((prev) => [...prev, ...picked]);
    e.target.value = null;
  };

  const removeScreenshotAt = (idx) => setScreenshots((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setUploading(true);

    if (!form.full_name.trim()) {
      setUploading(false);
      return setMessage("❌ Client name is required.");
    }

    if (!form.email.trim()) {
      setUploading(false);
      return setMessage("❌ Client email is required.");
    }

    // Warn-and-confirm on a returning email instead of silently creating a
    // duplicate — see utils/clientDuplicateRound.js.
    const disputeRound = await resolveRoundForNewClient(form.email, confirm);
    if (disputeRound === null) {
      setUploading(false);
      return setMessage("Canceled — this email already belongs to an existing client.");
    }

    let finalAgentId = form.agent_id || user.id;
    let finalAgentName = displayFullName;
    let finalAgentCode = agentCode || null;

    if (!isAgent && finalAgentId !== user.id) {
        const assignedAgent = companyAgents.find(a => a.id === finalAgentId);
        if (assignedAgent) {
            finalAgentName = assignedAgent.full_name;
            finalAgentCode = assignedAgent.agent_code;
        }
    }

    // 1. Insert Client
    setMessage("⏳ Creating client profile...");
    const { data, error } = await insertClientRecord({
        full_name: form.full_name.toUpperCase(),
        email: form.email,
        dispute_round: disputeRound,
        phone: form.phone || null,
        dob: form.dob || null,
        ssn: form.ssn || null,
        address: form.address || null,
        dispute_method: form.dispute_method,
        logins_notes: form.logins_notes || null,
        special_forms_notes: form.special_forms_notes || null,
        company_id: companyId,
        agent_id: finalAgentId,
        agent: finalAgentName,
        agent_code: finalAgentCode,
        recent_apps_notes: form.recent_apps_notes || null,
        special_instructions_notes: form.special_instructions_notes || null,
        report_email: form.report_email || null,
        report_password: form.report_password || null,
      }, { select: "id" });

    if (error || !data) {
      setUploading(false);
      return setMessage(`❌ Error adding client: ${error?.message}`);
    }

    const clientId = data.id;
    setCreatedClientId(clientId); 

    // 2. Upload Additional Documents
    if (file.length > 0) {
        try {
            for (const f of file) {
                 const fileName = `${Date.now()}_${f.name.replace(/\s+/g, "_")}`;
                 const path = `clients/${clientId}/${fileName}`;
                 const { error: upErr } = await supabase.storage.from("clients").upload(path, f);
                 if (upErr) throw upErr;
                 const { data: { publicUrl } } = supabase.storage.from("clients").getPublicUrl(path);
                 const { error: docErr } = await supabase
                   .from("client_documents")
                   .insert([{ client_id: clientId, file_name: f.name, file_url: publicUrl, uploaded_by: user?.id || null }]);
                 if (docErr) throw docErr;
            }
        } catch (err) {
             // Previously silent (console.error only) — a partner blocked by
             // RLS on this insert/upload would see the client save
             // successfully with no indication their document never
             // attached. Surfacing it lets them see the actual RLS/permission
             // error and know to retry or flag it, instead of silently
             // losing the file.
             console.error("File upload error:", err);
             addToast({ title: "Client Saved, Document Upload Failed", message: err.message || "Could not upload one or more documents. You can try again from the client's profile.", variant: "warning", icon: "bi-exclamation-triangle-fill", timeout: 9000 });
        }
    }

    // 3. Upload Screenshots & Append Links
    if (screenshots.length > 0) {
        try {
            let appendedNotes = form.special_forms_notes || "";
            for (let i = 0; i < screenshots.length; i++) {
                 const img = screenshots[i];
                 const fileName = `screenshot_${Date.now()}_${img.name.replace(/\s+/g, "_")}`;
                 const path = `clients/${clientId}/${fileName}`;
                 const { error: upErr } = await supabase.storage.from("clients").upload(path, img);
                 if (upErr) throw upErr;

                 const { data: { publicUrl } } = supabase.storage.from("clients").getPublicUrl(path);
                 appendedNotes += `\n\nScreenshot: ${publicUrl}`;

                 const { error: docErr } = await supabase
                   .from("client_documents")
                   .insert([{ client_id: clientId, file_name: `Priority Screenshot ${i+1}`, file_url: publicUrl, uploaded_by: user?.id || null }]);
                 if (docErr) throw docErr;
            }
            await supabase.from("clients").update({ special_forms_notes: appendedNotes }).eq("id", clientId);
        } catch (err) {
             console.error("Screenshot upload error:", err);
             addToast({ title: "Client Saved, Screenshot Upload Failed", message: err.message || "Could not upload one or more screenshots. You can try again from the client's profile.", variant: "warning", icon: "bi-exclamation-triangle-fill", timeout: 9000 });
        }
    }

    // 👇 4. FORCED AUTO-FETCH LOGIC (SmartCredit or IDIQ — see reportAutoImport.js) 👇
    if (form.report_email && form.report_password) {
      const providerLabel = reportProvider === "idiq" ? "IDIQ" : "SmartCredit";
      setMessage(`⏳ Verifying logins & importing ${providerLabel} Report...`);

      try {
        await runReportAutoImport(
          reportProvider,
          clientId,
          { email: form.report_email, password: form.report_password, pin: reportPin, ssn: reportSsn },
          user?.user_metadata?.full_name || "System"
        );

        await logAction({ action: reportProvider === "idiq" ? "fetch_idiq" : "fetch_3b", targetId: clientId, targetName: form.full_name.toUpperCase(), details: `Auto-imported ${providerLabel} report successfully during client creation.` });

      } catch (fetchErr) {
        console.error("Auto-fetch error:", fetchErr);
        // Alert the agent that the credentials failed, but proceed with routing so they don't lose the client file
        addToast({ title: "Client Saved, Import Failed", message: `${providerLabel} import failed: ${fetchErr.message}. Logins may be invalid — verify and retry on their profile.`, variant: "warning", icon: "bi-exclamation-triangle-fill", timeout: 9000 });
      }
    }

    // 5. Log Action for Creation
    await logAction({
        action: "create_client_portal",
        targetId: clientId,
        targetName: form.full_name.toUpperCase(),
        details: `Client created by ${fullName}. Assigned to: ${finalAgentName || 'Unassigned'} (Code: ${finalAgentCode || 'None'})`
    });

    setMessage(`✅ Client setup complete! Routing to profile...`);
    addToast({ title: "Client Created", message: `${form.full_name} was added.`, variant: "success", icon: "bi-person-check-fill" });

    setTimeout(() => {
      setUploading(false);
      handleClose();
      if (onClientAdded) onClientAdded();
      navigate(`/company-portal/${companyId}/clients/${clientId}`);
    }, 1500); 
  };

  const handleFileSelect = (e) => {
    const picked = Array.from(e.target.files || []);
    setFile((prev) => {
        const next = [...prev, ...picked];
        const seen = new Set();
        const unique = [];
        for (const f of next) {
          const k = fileKey(f);
          if (!seen.has(k)) { seen.add(k); unique.push(f); }
        }
        return unique;
    });
    e.target.value = null;
  };

  const removeFileAt = (idx) => setFile((prev) => prev.filter((_, i) => i !== idx));

  const { isDragActive: isFileDragActive, dropzoneProps: fileDropzoneProps } = useDropzone({
    onFiles: (dropped) =>
      setFile((prev) => {
        const next = [...prev, ...dropped];
        const seen = new Set();
        const unique = [];
        for (const f of next) {
          const k = fileKey(f);
          if (!seen.has(k)) {
            seen.add(k);
            unique.push(f);
          }
        }
        return unique;
      }),
  });

  return (
    <Modal show={show} onHide={handleClose} backdrop="static" centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title className="text-primary fw-bold">Add New Client</Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-light">
        <Form onSubmit={handleSubmit}>
          
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Full Name *</Form.Label>
                <Form.Control type="text" name="full_name" value={form.full_name} onChange={handleChange} required />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Email *</Form.Label>
                <Form.Control type="email" name="email" value={form.email} onChange={handleChange} required />
              </Form.Group>
            </Col>
          </Row>
          
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Phone</Form.Label>
                <Form.Control type="tel" name="phone" value={form.phone} onChange={handleChange} />
              </Form.Group>
            </Col>
             <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Date of Birth</Form.Label>
                <Form.Control type="date" name="dob" value={form.dob} onChange={handleChange} />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold">SSN</Form.Label>
                <Form.Control type="text" name="ssn" value={form.ssn} onChange={handleChange} placeholder="XXX-XX-XXXX" />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Address</Form.Label>
                <Form.Control type="text" name="address" value={form.address} onChange={handleChange} />
              </Form.Group>
            </Col>
          </Row>

          {/* 👇 CREDIT MONITORING SECTION 👇 */}
          <div className="mb-4 p-3 border rounded bg-white shadow-sm">
            <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary"><i className="bi bi-shield-lock-fill me-2"></i>Credit Report Credentials</h6>
            <p className="small text-muted mb-3">the system will automatically verify these logins and import the report</p>
            <Form.Group className="mb-3">
              <Form.Label className="fw-bold small text-muted text-uppercase">Report Provider</Form.Label>
              <Form.Select value={reportProvider} onChange={(e) => setReportProvider(e.target.value)}>
                <option value="smartcredit">SmartCredit</option>
                <option value="idiq">IDIQ (IdentityIQ)</option>
              </Form.Select>
            </Form.Group>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold small text-muted text-uppercase">Report Email</Form.Label>
                  <Form.Control type="email" name="report_email" value={form.report_email} onChange={handleChange} placeholder="client@email.com" />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold small text-muted text-uppercase">Report Password</Form.Label>
                  <InputGroup>
                    <Form.Control type={showPassword ? "text" : "password"} name="report_password" value={form.report_password} onChange={handleChange} placeholder="••••••••" />
                    <Button variant="outline-secondary" onClick={() => setShowPassword(!showPassword)}>
                      <i className={`bi bi-eye${showPassword ? '-slash' : ''}`}></i>
                    </Button>
                  </InputGroup>
                </Form.Group>
              </Col>
            </Row>
            {/* IDIQ-only: some accounts require a PIN and/or last-4 SSN to
                log in — see ParseRreportModal.jsx, the canonical IDIQ fetch
                flow used elsewhere in the app. Never persisted (transient,
                this fetch attempt only). */}
            {reportProvider === "idiq" && (
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small text-muted text-uppercase">PIN (if required)</Form.Label>
                    <Form.Control type="text" inputMode="numeric" pattern="[0-9]*" value={reportPin} onChange={(e) => setReportPin(e.target.value)} placeholder="Enter 4-digit PIN" autoComplete="one-time-code" />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small text-muted text-uppercase">Last 4 of SSN (if required)</Form.Label>
                    <Form.Control type="text" inputMode="numeric" pattern="[0-9]*" value={reportSsn} onChange={(e) => setReportSsn(e.target.value)} placeholder="Enter last 4 digits of SSN" autoComplete="off" />
                  </Form.Group>
                </Col>
              </Row>
            )}
          </div>


          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Assigned Agent</Form.Label>
            {isAgent ? (
                <Form.Control type="text" value={`Myself (${displayFullName})`} disabled className="bg-white" />
            ) : (
                <Form.Select name="agent_id" value={form.agent_id} onChange={handleChange}>
                    <option value={user?.id}>Myself ({displayFullName})</option>
                    <option disabled>──────────</option>
                    {companyAgents.map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.full_name} {agent.agent_code ? `(${agent.agent_code})` : ""}
                        </option>
                    ))}
                </Form.Select>
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Dispute Method</Form.Label>
            {/* Driven by the shared SERVICES list (utils/services.js) rather
                than hardcoded options — this dropdown was previously missing
                "Personal Identifiers" entirely, so partners had no way to
                create that client type themselves even though admin-side
                intake and Client Management's tabs both support it. */}
            <Form.Select name="dispute_method" value={form.dispute_method} onChange={handleChange}>
              {SERVICES.map((s) => (
                <option key={s.id} value={s.disputeMethod}>{s.label}</option>
              ))}
            </Form.Select>
          </Form.Group>

          <div className="mb-3 p-3 border border-danger rounded bg-white shadow-sm">
            <Form.Group className="mb-2">
              <div className="d-flex justify-content-between align-items-center mb-1">
                  <Form.Label className="fw-bold text-danger mb-0">
                    <i className="bi bi-exclamation-octagon-fill me-2"></i>Special Forms / Priority Notes
                  </Form.Label>
                  <Button variant="outline-danger" size="sm" className="border-0" onClick={() => screenshotInputRef.current?.click()}>
                    <i className="bi bi-image me-1"></i> Attach Image
                  </Button>
              </div>
              
              <Form.Control 
                as="textarea" 
                name="special_forms_notes" 
                value={form.special_forms_notes} 
                onChange={handleChange} 
                onPaste={handlePasteScreenshot}
                rows={3} 
                placeholder="Type critical instructions, OR paste (Ctrl+V) screenshots directly here..."
                className="border-danger"
              />
              <Form.Text className="text-muted small">
                These notes trigger a Red Alert popup. You can paste screenshots directly into the box.
              </Form.Text>

              <input type="file" accept="image/*" multiple ref={screenshotInputRef} style={{ display: 'none' }} onChange={handleScreenshotSelect} />
              
              {screenshots.length > 0 && (
                 <div className="mt-3 d-flex flex-wrap gap-2">
                    {screenshots.map((s, idx) => (
                       <Badge bg="light" text="dark" key={idx} className="d-flex align-items-center p-2 shadow-sm border border-danger">
                           <img 
                             src={URL.createObjectURL(s)} 
                             alt="Pasted screenshot preview" 
                             style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} 
                             className="me-2 border border-secondary"
                           />
                           <span className="me-2 fw-bold text-muted">Screenshot attached</span>
                           <i 
                             className="bi bi-x-circle-fill text-danger fs-5" 
                             style={{cursor: 'pointer'}} 
                             onClick={() => removeScreenshotAt(idx)}
                             title="Remove image"
                           ></i>
                       </Badge>
                    ))}
                 </div>
              )}
            </Form.Group>
          </div>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">General Logins / Notes</Form.Label>
            <Form.Control 
              as="textarea" 
              name="logins_notes" 
              value={form.logins_notes} 
              onChange={handleChange} 
              rows={3} 
              placeholder="Enter general client history..."
            />
          </Form.Group>

          {isTrusted && (
            <div className="mb-3 p-3 border rounded bg-white shadow-sm">
                <div className="text-danger fw-bold small mb-2"><i className="bi bi-exclamation-triangle-fill me-2"></i>TRUSTED POLICY: No A&D, Advantage, or Rick Case.</div>
                <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Recent applications?</Form.Label>
                    <div>
                        <Form.Check inline type="radio" name="has_recent_apps" id="raNo" label="No" value="no" checked={!form.has_recent_apps} onChange={handleChange} />
                        <Form.Check inline type="radio" name="has_recent_apps" id="raYes" label="Yes" value="yes" checked={form.has_recent_apps} onChange={handleChange} />
                    </div>
                    {form.has_recent_apps && <Form.Control size="sm" className="mt-1" placeholder="Notes..." value={form.recent_apps_notes} onChange={(e) => setForm(p => ({...p, recent_apps_notes: e.target.value}))} />}
                </Form.Group>
            </div>
          )}

          <div className="mb-3">
              <CoverLetterAssetsLTOS
                clientId={createdClientId}
                companyName={companyName}
                clientName={form.full_name.trim() ? form.full_name.toUpperCase() : undefined}
                clientAddress={form.address || undefined}
                clientDob={form.dob || undefined}
                onChange={(urls) => setForm((f) => ({ ...f, ...urls }))}
              />
          </div>

          <Form.Group className="mb-4">
            <Form.Label className="fw-bold">Additional Documents</Form.Label>
            <div
              {...fileDropzoneProps}
              onClick={() => fileInputRef.current?.click()}
              className={`border rounded p-4 text-center ${isFileDragActive ? "border-primary bg-primary bg-opacity-10" : "border-secondary-subtle bg-white"}`}
              style={{ borderStyle: "dashed", cursor: "pointer", transition: "background-color 0.15s, border-color 0.15s" }}
            >
              <i className={`bi bi-cloud-arrow-up${isFileDragActive ? "-fill" : ""} fs-2 d-block mb-1 ${isFileDragActive ? "text-primary" : "text-muted"}`}></i>
              <span className={`small ${isFileDragActive ? "text-primary fw-semibold" : "text-muted"}`}>
                {isFileDragActive ? "Drop files to upload" : "Drag & drop files here, or click to browse"}
              </span>
              <Form.Control type="file" multiple onChange={handleFileSelect} ref={fileInputRef} className="d-none" />
            </div>
             {file.length > 0 && (
                <ul className="mt-2 list-unstyled bg-white p-2 border rounded">
                    {file.map((f, i) => (
                        <li key={i} className="d-flex justify-content-between py-1 border-bottom small">
                            <span>{f.name}</span>
                            <button type="button" className="btn btn-sm text-danger p-0" onClick={() => removeFileAt(i)}>&times;</button>
                        </li>
                    ))}
                </ul>
            )}
          </Form.Group>

          <Button className="w-100 fw-bold py-3 fs-5" type="submit" disabled={uploading}>
            {uploading ? <><Spinner as="span" size="sm" animation="border" className="me-2" />Processing Client...</> : 'Submit & Create Client Profile'}
          </Button>
        </Form>
        {message && <Alert variant={message.includes('✅') ? "success" : "info"} className="mt-3 text-center fw-bold">{message}</Alert>}
      </Modal.Body>
    </Modal>
  );
}