import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import CoverLetterAssetsLTOS from "../client-pages/CoverLetterAssetsLTOS";
import { resolveRoundForNewClient, insertClientRecord } from "../../../utils/clientDuplicateRound";
import { SERVICES } from "../../../utils/services";
import { runReportAutoImport } from "../../../utils/reportAutoImport";
import { useToast } from "../ui/ToastNotifier";
import { useConfirm } from "../ui/ConfirmDialog";
import useDropzone from "../../../hooks/useDropzone";

export default function AddClientForm() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const { companyId } = useParams(); 
  const [createdClientId, setCreatedClientId] = useState(null);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    dob: "",
    ssn: "",
    address: "",
    logins_notes: "",
    special_forms_notes: "",
    company_id: "",
    dispute_method: "inquiry deletion",
    agent_id: "",
    has_recent_apps: false,
    recent_apps_notes: "",
    has_special_instructions: false,
    special_instructions_notes: "",
    identityUrl: "",
    addressUrl: "",
    authorizationUrl: "",
    // 👇 NEW: Credentials
    report_email: "",
    report_password: ""
  });

  const [companies, setCompanies] = useState([]);
  const [companyAgents, setCompanyAgents] = useState([]);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState([]);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Which report provider the "report_email"/"report_password" fields below
  // belong to — see utils/reportAutoImport.js. Both providers share the same
  // generic credential columns on `clients` (used for retry elsewhere, e.g.
  // ClientHeader.jsx's "Credit Logins" badges / Fetch3bModal.jsx), so this is
  // purely a UI/routing choice, not a separate set of fields.
  const [reportProvider, setReportProvider] = useState("smartcredit");
  // IDIQ-only, optional per ParseRreportModal.jsx ("PIN/SSN if required") —
  // not persisted to the clients row (matching ParseRreportModal.jsx, which
  // also never saves these; they're only used for this one fetch attempt).
  const [reportPin, setReportPin] = useState("");
  const [reportSsn, setReportSsn] = useState("");

  const selectedCompany = companies.find((c) => c.id === form.company_id);
  const companyNameLower = selectedCompany?.company_name?.toLowerCase() || "";
  const isTrusted = companyNameLower.includes("trusted"); 

  useEffect(() => {
    const fetchCompanies = async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, company_name")
        .order('company_name');
        
      if (data) {
        setCompanies(data);
        if (companyId && data.some((c) => c.id === companyId)) {
          setForm((prev) => ({ ...prev, company_id: companyId }));
        }
      }
    };
    fetchCompanies();
  }, [companyId]);

  useEffect(() => {
    if (!form.company_id) {
        setCompanyAgents([]);
        return;
    }
    const fetchAgents = async () => {
        try {
            // First try RPC
            const { data, error } = await supabase.rpc('get_company_agents', { target_company_id: form.company_id });
            if (!error && data) {
                setCompanyAgents(data);
                return;
            } 
            // FIX: If RPC fails, fallback to strict query that includes agent_code and correct roles
            const { data: fallbackData } = await supabase
                .from("company_user_profiles")
                .select("id, full_name, role, agent_code") // Added agent_code
                .eq("company_id", form.company_id)
                .in("role", ["agent", "company_agent"]); // Restricted to actual agents
            
            if (fallbackData) setCompanyAgents(fallbackData);
        } catch (err) { console.error(err); }
    };
    fetchAgents();
  }, [form.company_id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "company_id") {
      setForm((prev) => ({ ...prev, company_id: value, agent_id: "" }));
    } else if (name === "has_recent_apps" || name === "has_special_instructions") {
      const field = name === "has_recent_apps" ? "has_recent_apps" : "has_special_instructions";
      setForm((prev) => ({ ...prev, [field]: value === "yes" }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

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

    const cleanSSN = form.ssn ? form.ssn.replace(/\D/g, "") : null;

    // Safely extract ID, Name, and Code based on dropdown selection
    let finalAgentId = form.agent_id || null;
    const selectedAgentObj = companyAgents.find(a => a.id === finalAgentId);
    let finalAgentName = selectedAgentObj?.full_name || null;
    let finalAgentCode = selectedAgentObj?.agent_code || null;

    // 1. Create Client
    setMessage("⏳ Creating client profile...");
    const { data: clientData, error: clientError } = await insertClientRecord({
        full_name: form.full_name.toUpperCase(),
        email: form.email,
        dispute_round: disputeRound,
        phone: form.phone || null,
        dob: form.dob || null,
        ssn: cleanSSN,
        address: form.address || null,
        dispute_method: form.dispute_method,
        logins_notes: form.logins_notes || null,
        special_forms_notes: form.special_forms_notes || null,
        company_id: form.company_id || null,
        agent_id: finalAgentId,
        agent: finalAgentName,
        agent_code: finalAgentCode,
        recent_apps_notes: form.recent_apps_notes || null,
        special_instructions_notes: form.special_instructions_notes || null,
        // 👇 NEW: Save credentials
        report_email: form.report_email || null,
        report_password: form.report_password || null,
      }, { select: "id" });

    if (clientError || !clientData) {
      setUploading(false);
      return setMessage(`❌ Error adding client: ${clientError?.message}`);
    }

    const clientId = clientData.id;
    setCreatedClientId(clientId);

    // 2. Handle additional file uploads
    if (file.length > 0) {
      try {
        for (const f of file) {
          const fileName = `${Date.now()}_${f.name.replace(/\s+/g, "_")}`;
          const path = `clients/${clientId}/${fileName}`;
          const { error: upErr } = await supabase.storage.from("clients").upload(path, f);
          if (upErr) throw upErr;

          const { data: { publicUrl } } = supabase.storage.from("clients").getPublicUrl(path);
          const { error: docErr } = await supabase.from("client_documents").insert([{
              client_id: clientId,
              file_name: f.name,
              file_url: publicUrl,
          }]);
          if (docErr) throw docErr;
        }
      } catch (uploadErr) {
        // Previously silent (console.error only) — this is a public,
        // unauthenticated form, so a partner blocked here by RLS or any
        // other storage/DB error would see "Client added successfully!"
        // with zero indication their document never attached. Surfacing
        // it at least tells them to re-upload from the client's profile.
        console.error(uploadErr);
        addToast({ title: "Client Saved, Document Upload Failed", message: uploadErr.message || "Could not upload one or more documents. Please try again from the client's profile.", variant: "warning", icon: "bi-exclamation-triangle-fill", timeout: 9000 });
      }
    }

    // 👇 3. FORCED AUTO-FETCH LOGIC (SmartCredit or IDIQ — see reportAutoImport.js) 👇
    if (form.report_email && form.report_password) {
      const providerLabel = reportProvider === "idiq" ? "IDIQ" : "SmartCredit";
      setMessage(`⏳ Verifying logins & importing ${providerLabel} Report... (Please wait up to 45s)`);

      try {
        await runReportAutoImport(
          reportProvider,
          clientId,
          { email: form.report_email, password: form.report_password, pin: reportPin, ssn: reportSsn },
          "System"
        );
      } catch (fetchErr) {
        console.error("Auto-fetch error:", fetchErr);
        // Alert the admin that the credentials failed, but keep processing the UI reset
        addToast({ title: "Client Saved, Import Failed", message: `${providerLabel} import failed: ${fetchErr.message}. Logins may be invalid — verify and retry on their profile.`, variant: "warning", icon: "bi-exclamation-triangle-fill", timeout: 9000 });
      }
    }

    // 4. Show success, and clear the form
    setMessage(`✅ Client added successfully!`);
    addToast({ title: "Client Added", message: "Client was added successfully.", variant: "success", icon: "bi-person-check-fill" });
    
    setTimeout(() => {
      setUploading(false);
      
      // Reset form to allow multiple submissions
      setForm({
        full_name: "",
        email: "",
        phone: "",
        dob: "",
        ssn: "",
        address: "",
        logins_notes: "",
        special_forms_notes: "",
        company_id: companyId || "",
        dispute_method: "inquiry deletion",
        agent_id: "",
        has_recent_apps: false,
        recent_apps_notes: "",
        has_special_instructions: false,
        special_instructions_notes: "",
        identityUrl: "",
        addressUrl: "",
        authorizationUrl: "",
        report_email: "",
        report_password: ""
      });
      setCreatedClientId(null);
      setFile([]);
      setShowPassword(false);
      setReportProvider("smartcredit");
      setReportPin("");
      setReportSsn("");
      if (fileInputRef.current) fileInputRef.current.value = "";

      // Hide success message after 5 seconds
      setTimeout(() => setMessage(""), 5000);
    }, 1500); 
  };

  const handleFileSelect = (e) => {
    const picked = Array.from(e.target.files || []);
    setFile((prev) => [...prev, ...picked]);
    e.target.value = null;
  };

  const removeFileAt = (idx) => setFile((prev) => prev.filter((_, i) => i !== idx));

  const { isDragActive: isFileDragActive, dropzoneProps: fileDropzoneProps } = useDropzone({
    onFiles: (dropped) => setFile((prev) => [...prev, ...dropped]),
  });

  return (
    <div className="container mt-4 login-container ">
      <h4 className="mb-4"><i className="bi bi-person-plus me-2 text-primary"></i>Intake Form</h4>

      <form onSubmit={handleSubmit} className="p-4 border rounded shadow-sm bg-white text-dark">
        {/* --- Identity Section --- */}
        <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-semibold">Full Name *</label>
                <input type="text" name="full_name" className="form-control" value={form.full_name} onChange={handleChange} required />
            </div>
            <div className="col-md-6">
                <label className="form-label fw-semibold">Email *</label>
                <input type="email" name="email" className="form-control" value={form.email} onChange={handleChange} required />
            </div>
        </div>

        <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-semibold">Phone</label>
                <input type="tel" name="phone" className="form-control" value={form.phone} onChange={handleChange} />
            </div>
            <div className="col-md-6">
                <label className="form-label fw-semibold">Date of Birth</label>
                <input type="date" name="dob" className="form-control" value={form.dob} onChange={handleChange} />
            </div>
        </div>

        <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-semibold">SSN</label>
                <input type="text" name="ssn" className="form-control" placeholder="XXX-XX-XXXX" value={form.ssn} onChange={handleChange} />
            </div>
            <div className="col-md-6">
                <label className="form-label fw-semibold">Address</label>
                <input type="text" name="address" className="form-control" value={form.address} onChange={handleChange} />
            </div>
        </div>

        {/* 👇 CREDIT MONITORING SECTION 👇 */}
        <div className="mb-4 p-3 border rounded bg-light shadow-sm">
          <h6 className="fw-bold border-bottom pb-2 mb-3 text-primary"><i className="bi bi-shield-lock-fill me-2"></i>Credit Report Credentials (Optional)</h6>
          <p className="small text-muted mb-3">If provided, the system will automatically verify these logins and import the report</p>
          <div className="mb-3">
            <label className="form-label fw-bold small text-muted text-uppercase">Report Provider</label>
            <select className="form-select bg-white" value={reportProvider} onChange={(e) => setReportProvider(e.target.value)}>
              <option value="smartcredit">SmartCredit</option>
              <option value="idiq">IDIQ (IdentityIQ)</option>
            </select>
          </div>
          <div className="row">
            <div className="col-md-6 mb-3 mb-md-0">
              <label className="form-label fw-bold small text-muted text-uppercase">Report Email</label>
              <input type="email" name="report_email" className="form-control bg-white" value={form.report_email} onChange={handleChange} placeholder="client@email.com" />
            </div>
            <div className="col-md-6">
              <label className="form-label fw-bold small text-muted text-uppercase">Report Password</label>
              <div className="input-group shadow-sm">
                <input type={showPassword ? "text" : "password"} name="report_password" className="form-control bg-white border-end-0" value={form.report_password} onChange={handleChange} placeholder="••••••••" />
                <button className="btn btn-outline-secondary bg-white border-start-0" type="button" onClick={() => setShowPassword(!showPassword)}>
                  <i className={`bi bi-eye${showPassword ? '-slash-fill' : '-fill'}`}></i>
                </button>
              </div>
            </div>
          </div>
          {/* IDIQ-only: some accounts require a PIN and/or last-4 SSN to log
              in — see ParseRreportModal.jsx, the canonical IDIQ fetch flow
              used elsewhere in the app. Never persisted (transient, this
              fetch attempt only). */}
          {reportProvider === "idiq" && (
            <div className="row mt-3">
              <div className="col-md-6 mb-3 mb-md-0">
                <label className="form-label fw-bold small text-muted text-uppercase">PIN (if required)</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-control bg-white" value={reportPin} onChange={(e) => setReportPin(e.target.value)} placeholder="Enter 4-digit PIN" autoComplete="one-time-code" />
              </div>
              <div className="col-md-6">
                <label className="form-label fw-bold small text-muted text-uppercase">Last 4 of SSN (if required)</label>
                <input type="text" inputMode="numeric" pattern="[0-9]*" className="form-control bg-white" value={reportSsn} onChange={(e) => setReportSsn(e.target.value)} placeholder="Enter last 4 digits of SSN" autoComplete="off" />
              </div>
            </div>
          )}
        </div>

        {/* --- Assignment Section --- */}
        <div className="mb-3">
          <label className="form-label fw-semibold">Company</label>
          <select 
            className={`form-select ${companyId ? 'bg-dark text-white' : ''}`} 
            name="company_id" 
            value={form.company_id} 
            onChange={handleChange} 
            required 
            disabled={!!companyId}
          >
            <option value="">-- Select Company --</option>
            {companies.map((c) => (<option key={c.id} value={c.id}>{c.company_name}</option>))}
          </select>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">Agent</label>
          <select name="agent_id" className="form-select" value={form.agent_id} onChange={handleChange} required={isTrusted} disabled={!form.company_id}>
            <option value="">-- Select Agent --</option>
            {companyAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name} {a.agent_code ? `(${a.agent_code})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">Dispute Method *</label>
          {/* Driven by the shared SERVICES list (utils/services.js) instead
              of hardcoded options — this dropdown was missing Fraud Alert
              Removal and Personal Identifiers entirely. */}
          <select name="dispute_method" className="form-select" value={form.dispute_method} onChange={handleChange} required>
            {SERVICES.map((s) => (
              <option key={s.id} value={s.disputeMethod}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* --- HIGH PRIORITY NOTES SECTION --- */}
        <div className="mb-3 p-3 border border-danger rounded bg-light shadow-sm">
            <label className="form-label fw-bold text-danger">
                <i className="bi bi-exclamation-octagon-fill me-2"></i>Special Forms / High Priority Notes
            </label>
            <textarea 
                name="special_forms_notes" 
                className="form-control border-danger" 
                value={form.special_forms_notes} 
                onChange={handleChange} 
                rows={2}
                placeholder="Critical info that Admins MUST see immediately (e.g., special handling, unique instructions)..."
            />
            <div className="form-text text-danger small">These notes trigger an alert popup on the profile page.</div>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">Logins / General Notes</label>
          <textarea 
            name="logins_notes" 
            className="form-control" 
            value={form.logins_notes} 
            onChange={handleChange} 
            rows={3} 
            placeholder="IdentityIQ logins or general client history..."
          />
        </div>

        {/* Required Assets Section */}
        {!isTrusted && form.company_id && (
          <div className="mb-4">
            <CoverLetterAssetsLTOS
              clientId={createdClientId}
              companyName={selectedCompany?.company_name}
              clientName={form.full_name.trim() ? form.full_name.toUpperCase() : undefined}
              clientAddress={form.address || undefined}
              clientDob={form.dob || undefined}
              onChange={(urls) => setForm((f) => ({ ...f, ...urls }))}
            />
          </div>
        )}

        {/* Trusted Specific Section */}
        {isTrusted && (
          <div className="p-3 border rounded bg-light mb-3">
            <div className="alert alert-warning py-2 mb-2 small">
                <i className="bi bi-info-circle me-2"></i>Excluding A&D Mortgage, Advantage Credit, Rick Case.
            </div>
            <label className="form-label small fw-bold">Recent application?</label>
            <div>
                <input className="form-check-input me-1" type="radio" name="has_recent_apps" value="no" checked={!form.has_recent_apps} onChange={handleChange} /> No
                <input className="form-check-input ms-3 me-1" type="radio" name="has_recent_apps" value="yes" checked={form.has_recent_apps} onChange={handleChange} /> Yes
            </div>
            {form.has_recent_apps && <textarea name="recent_apps_notes" className="form-control mt-2" value={form.recent_apps_notes} onChange={handleChange} rows={2} />}
          </div>
        )}

        {/* File Upload Section */}
        <div className="mb-3">
            <label className="form-label fw-semibold"><i className="bi bi-upload me-2"></i>Additional Documents</label>
            <div
              {...fileDropzoneProps}
              onClick={() => fileInputRef.current?.click()}
              className={`border rounded p-4 text-center ${isFileDragActive ? "border-primary bg-primary bg-opacity-10" : "border-secondary-subtle bg-light"}`}
              style={{ borderStyle: "dashed", cursor: "pointer", transition: "background-color 0.15s, border-color 0.15s" }}
            >
              <i className={`bi bi-cloud-arrow-up${isFileDragActive ? "-fill" : ""} fs-2 d-block mb-1 ${isFileDragActive ? "text-primary" : "text-muted"}`}></i>
              <span className={`small ${isFileDragActive ? "text-primary fw-semibold" : "text-muted"}`}>
                {isFileDragActive ? "Drop files to upload" : "Drag & drop files here, or click to browse"}
              </span>
              <input type="file" multiple onChange={handleFileSelect} ref={fileInputRef} className="d-none" />
            </div>
            {file.length > 0 && (
                <ul className="mt-2 list-unstyled border-top pt-2">
                    {file.map((f, i) => (
                        <li key={i} className="d-flex justify-content-between align-items-center mb-1">
                            <small className="text-truncate" style={{maxWidth:'80%'}}>{f.name}</small>
                            <button type="button" className="btn btn-sm text-danger" onClick={() => removeFileAt(i)}>&times;</button>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        <button className="btn btn-primary w-100 py-2 fw-bold" type="submit" disabled={uploading}>
          {uploading ? (
            <><span className="spinner-border spinner-border-sm me-2"/>Processing Client...</>
          ) : (
            "Submit Client"
          )}
        </button>
      </form>
      
      {/* Alert renders completely clean now */}
      {message && (
        <div className={`alert mt-4 fw-bold shadow-sm ${message.includes('✅') ? 'alert-success' : message.includes('⚠️') ? 'alert-warning' : 'alert-info'}`}>
          {message}
        </div>
      )}
    </div>
  );
}