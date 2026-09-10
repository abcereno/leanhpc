import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../supabaseClient"; // Adjust path if needed
import { resolveRoundForNewClient, insertClientRecord } from "../../../utils/clientDuplicateRound";
import { SERVICES } from "../../../utils/services";
import { useConfirm } from "../../shared/ui/ConfirmDialog";

export default function AddClientFormStandard({ onClientAdded }) {
  const { confirm } = useConfirm();
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
    dispute_method: "credit repair",
    agent_id: "",
  });

  const [companies, setCompanies] = useState([]);
  const [companyAgents, setCompanyAgents] = useState([]); 
  const [message, setMessage] = useState("");
  const [file, setFile] = useState([]);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  // 1. Fetch Companies on load
  useEffect(() => {
    const fetchCompanies = async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, company_name")
        .order('company_name');
        
      if (data) setCompanies(data);
    };
    fetchCompanies();
  }, []);

  // 2. Fetch Agents when a company is selected
  useEffect(() => {
    if (!form.company_id) {
        setCompanyAgents([]);
        return;
    }
    const fetchAgents = async () => {
        try {
            const { data: fallbackData } = await supabase
                .from("company_user_profiles")
                .select("id, full_name, role, agent_code")
                .eq("company_id", form.company_id)
                .in("role", ["agent", "company_agent"]); 
            
            if (fallbackData) setCompanyAgents(fallbackData);
        } catch (err) { console.error(err); }
    };
    fetchAgents();
  }, [form.company_id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "company_id") {
      setForm((prev) => ({ ...prev, company_id: value, agent_id: "" }));
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
    const { data: clientData, error: clientError } = await insertClientRecord({
        full_name: form.full_name.toUpperCase(),
        email: form.email,
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
        dispute_round: disputeRound,
      }, { select: "id" });

    if (clientError || !clientData) {
      setUploading(false);
      return setMessage(`❌ Error adding client: ${clientError?.message}`);
    }

    const clientId = clientData.id;

    // 2. Handle additional file uploads
    if (file.length > 0) {
      try {
        for (const f of file) {
          const fileName = `${Date.now()}_${f.name.replace(/\s+/g, "_")}`;
          const path = `clients/${clientId}/${fileName}`;
          const { error: upErr } = await supabase.storage.from("clients").upload(path, f);
          if (upErr) throw upErr;

          const { data: { publicUrl } } = supabase.storage.from("clients").getPublicUrl(path);
          await supabase.from("client_documents").insert([{
              client_id: clientId,
              file_name: f.name,
              file_url: publicUrl,
          }]);
        }
      } catch (uploadErr) { console.error(uploadErr); }
    }

    // 3. Show success and clear form
    setUploading(false);
    setMessage(`✅ Client added successfully!`);
    
    setForm({
      full_name: "", email: "", phone: "", dob: "", ssn: "", address: "",
      logins_notes: "", special_forms_notes: "", company_id: "",
      dispute_method: "credit repair", agent_id: ""
    });
    setFile([]);
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Optional: Trigger a refresh in the parent component if passed
    if (onClientAdded) onClientAdded();

    setTimeout(() => setMessage(""), 4000);
  };

  const handleFileSelect = (e) => {
    const picked = Array.from(e.target.files || []);
    setFile((prev) => [...prev, ...picked]);
    e.target.value = null;
  };

  const removeFileAt = (idx) => setFile((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="p-2 font-sans">
      <h4 className="mb-4 fw-bold"><i className="bi bi-person-plus me-2 text-primary"></i>Add New Client</h4>

      <form onSubmit={handleSubmit} className="text-dark">
        {/* --- Identity Section --- */}
        <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-semibold small text-muted mb-1">Full Name <span className="text-danger">*</span></label>
                <input type="text" name="full_name" className="form-control" value={form.full_name} onChange={handleChange} required />
            </div>
            <div className="col-md-6">
                <label className="form-label fw-semibold small text-muted mb-1">Email <span className="text-danger">*</span></label>
                <input type="email" name="email" className="form-control" value={form.email} onChange={handleChange} required />
            </div>
        </div>

        <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-semibold small text-muted mb-1">Phone</label>
                <input type="tel" name="phone" className="form-control" value={form.phone} onChange={handleChange} />
            </div>
            <div className="col-md-6">
                <label className="form-label fw-semibold small text-muted mb-1">Date of Birth</label>
                <input type="date" name="dob" className="form-control" value={form.dob} onChange={handleChange} />
            </div>
        </div>

        <div className="row mb-3">
            <div className="col-md-6">
                <label className="form-label fw-semibold small text-muted mb-1">SSN</label>
                <input type="text" name="ssn" className="form-control" placeholder="XXX-XX-XXXX" value={form.ssn} onChange={handleChange} />
            </div>
            <div className="col-md-6">
                <label className="form-label fw-semibold small text-muted mb-1">Address</label>
                <input type="text" name="address" className="form-control" value={form.address} onChange={handleChange} />
            </div>
        </div>

        {/* --- Assignment Section --- */}
        <div className="row mb-3">
            <div className="col-md-4">
              <label className="form-label fw-semibold small text-muted mb-1">Company</label>
              <select className="form-select" name="company_id" value={form.company_id} onChange={handleChange}>
                <option value="">-- Optional --</option>
                {companies.map((c) => (<option key={c.id} value={c.id}>{c.company_name}</option>))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold small text-muted mb-1">Agent</label>
              <select name="agent_id" className="form-select" value={form.agent_id} onChange={handleChange} disabled={!form.company_id}>
                <option value="">-- Optional --</option>
                {companyAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name} {a.agent_code ? `(${a.agent_code})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label fw-semibold small text-muted mb-1">Dispute Method</label>
              {/* Driven by the shared SERVICES list (utils/services.js)
                  instead of hardcoded options — this dropdown was missing
                  Fraud Alert Removal and Personal Identifiers entirely. */}
              <select name="dispute_method" className="form-select" value={form.dispute_method} onChange={handleChange}>
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.disputeMethod}>{s.label}</option>
                ))}
              </select>
            </div>
        </div>

        {/* --- Notes Section --- */}
        <div className="mb-3 p-3 border border-danger border-opacity-50 rounded bg-danger bg-opacity-10">
            <label className="form-label fw-bold text-danger small mb-1">
                <i className="bi bi-exclamation-octagon-fill me-2"></i>High Priority / Alert Notes
            </label>
            <textarea 
                name="special_forms_notes" 
                className="form-control border-danger" 
                value={form.special_forms_notes} 
                onChange={handleChange} 
                rows={2}
                placeholder="Critical info that Admins MUST see immediately..."
            />
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold small text-muted mb-1">Logins / General Notes</label>
          <textarea 
            name="logins_notes" 
            className="form-control" 
            value={form.logins_notes} 
            onChange={handleChange} 
            rows={2} 
            placeholder="Credit monitoring logins or general background..."
          />
        </div>

        {/* File Upload Section */}
        <div className="mb-4">
            <label className="form-label fw-semibold small text-muted mb-1"><i className="bi bi-upload me-2"></i>Initial Documents</label>
            <input type="file" multiple onChange={handleFileSelect} ref={fileInputRef} className="form-control form-control-sm" />
            {file.length > 0 && (
                <ul className="mt-2 list-unstyled bg-light p-2 rounded border">
                    {file.map((f, i) => (
                        <li key={i} className="d-flex justify-content-between align-items-center mb-1">
                            <small className="text-truncate fw-medium" style={{maxWidth:'85%'}}><i className="bi bi-file-earmark me-2 text-primary"></i>{f.name}</small>
                            <button type="button" className="btn btn-sm text-danger p-0" onClick={() => removeFileAt(i)}><i className="bi bi-x-circle-fill"></i></button>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        <button className="btn btn-primary w-100 py-2 fw-bold shadow-sm" type="submit" disabled={uploading}>
          {uploading ? <><span className="spinner-border spinner-border-sm me-2"/>Saving Client...</> : "Submit Client"}
        </button>
      </form>
      
      {message && <div className={`alert mt-3 text-center fw-bold shadow-sm ${message.includes('✅') ? 'alert-success border-success' : 'alert-danger border-danger'}`}>{message}</div>}
    </div>
  );
}