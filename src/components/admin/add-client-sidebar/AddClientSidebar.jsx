import { useEffect, useRef, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import useLogger from "../../../hooks/useLogger";
import { resolveRoundForNewClient, insertClientRecord } from "../../../utils/clientDuplicateRound";
import { SERVICES } from "../../../utils/services";

export default function AddClientSidebar({ isOpen, onClose, companyId }) {
  const [form, setForm] = useState({
    full_name: "",
    ssn: "",
    email: "",
    phone: "",
    dob: "",
    address: "",
    dispute_method: "inquiry deletion",
    logins_notes: "",
    company_id: "",
    admin_id: "",
    agent_id: "",
  });

  const [companies, setCompanies] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [companyAgents, setCompanyAgents] = useState([]); 

  const [file, setFile] = useState([]);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  
  const logAction = useLogger();

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: companiesData }, { data: adminsData }] = await Promise.all([
        supabase.from("companies").select("id, company_name").order("company_name"),
        supabase.from("profiles").select("id, full_name").order("full_name"),
      ]);
      
      if (companiesData) {
        setCompanies(companiesData);
        if (companyId && companiesData.some((c) => c.id === companyId)) {
          setForm((prev) => ({ ...prev, company_id: companyId }));
        }
      }
      if (adminsData) setAdmins(adminsData);
    };
    fetchData();
  }, [companyId]);

  // FIX: Using RPC to bypass Admin RLS blocks
  useEffect(() => {
    if (!form.company_id) {
        setCompanyAgents([]);
        return;
    }
    const fetchAgents = async () => {
        try {
            const { data, error } = await supabase.rpc('get_company_agents', { target_company_id: form.company_id });
            
            if (!error && data && data.length > 0) {
                setCompanyAgents(data);
                return;
            } 
            
            const { data: fallbackData } = await supabase
                .from("company_user_profiles")
                .select("id, full_name, role, agent_code")
                .eq("company_id", form.company_id)
                .in("role", ["agent", "company_agent"]); 
            
            if (fallbackData) setCompanyAgents(fallbackData);
        } catch (err) { 
            console.error("Error fetching agents:", err); 
        }
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
    setUploading(true);
    setMessage("");

    const requiredFields = [
      "full_name",
      "ssn",
      "email",
      "phone",
      "dob",
      "address",
      "dispute_method",
      "logins_notes",
      "company_id",
      "admin_id",
      "agent_id", 
    ];

    for (const field of requiredFields) {
      if (!form[field]?.trim()) {
        setUploading(false);
        return setMessage(`❌ ${field.replace("_", " ").toUpperCase()} is required.`);
      }
    }

    if (!file.length) {
      setUploading(false);
      return setMessage("❌ At least one file must be uploaded.");
    }

    // Warn-and-confirm on a returning email instead of silently creating a
    // duplicate — see utils/clientDuplicateRound.js.
    const disputeRound = await resolveRoundForNewClient(form.email);
    if (disputeRound === null) {
      setUploading(false);
      return setMessage("Canceled — this email already belongs to an existing client.");
    }

    let finalAgentId = form.agent_id || null;
    const selectedAgentObj = companyAgents.find(a => a.id === finalAgentId);
    let finalAgentName = selectedAgentObj?.full_name || null;
    let finalAgentCode = selectedAgentObj?.agent_code || null;

    const { data, error } = await insertClientRecord({
        full_name: form.full_name.toUpperCase(),
        ssn: form.ssn,
        email: form.email,
        phone: form.phone,
        dob: form.dob,
        address: form.address,
        dispute_method: form.dispute_method,
        logins_notes: form.logins_notes,
        company_id: form.company_id,
        admin_id: form.admin_id,
        agent_id: finalAgentId,
        agent: finalAgentName,
        agent_code: finalAgentCode,
        dispute_round: disputeRound,
      }, { select: "id" });

    if (error || !data) {
      setUploading(false);
      return setMessage(`❌ Error adding client: ${error?.message}`);
    }

    const clientId = data.id;

    try {
      for (const f of file) {
        const fileName = `${Date.now()}_${f.name.replace(/\s+/g, "_")}`;
        const path = `clients/${clientId}/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("clients")
          .upload(path, f, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from("clients").getPublicUrl(path);
        const { error: insertError } = await supabase
          .from("client_documents")
          .insert([{ client_id: clientId, file_name: f.name, file_url: publicUrl }]);
        if (insertError) throw insertError;
      }
    } catch (err) {
      setUploading(false);
      return setMessage(`❌ File upload failed: ${err.message}`);
    }

    await logAction({
        action: "create_client",
        targetId: clientId,
        targetName: form.full_name.toUpperCase(),
        details: `Created new client with ${file.length} initial document(s). Assigned to Agent: ${finalAgentName || 'None'}`
    });

    setMessage("✅ Client added successfully.");
    setUploading(false);
    
    setForm({
      full_name: "",
      ssn: "",
      email: "",
      phone: "",
      dob: "",
      address: "",
      dispute_method: "inquiry deletion",
      logins_notes: "",
      company_id: companyId || "",
      admin_id: "",
      agent_id: "",
    });
    setFile([]);
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="sidebar-overlay" />
      <div className={`reminders-sidebar ${isOpen ? "open" : ""}`} >
        <div className="sidebar-header d-flex justify-content-between align-items-center p-3 border-bottom">
          <h5 className="mb-0 text-light">Add New Client</h5>
          <Button variant="link" onClick={onClose} className="p-0">
            <i className="bi bi-x-lg text-white"></i>
          </Button>
        </div>

        <div className="sidebar-body p-3 text-white">
          <form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label className="text-white">Full Name</Form.Label>
              <Form.Control type="text" name="full_name" value={form.full_name} onChange={handleChange} required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">SSN</Form.Label>
              <Form.Control type="text" name="ssn" value={form.ssn} onChange={handleChange} required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Email</Form.Label>
              <Form.Control type="email" name="email" value={form.email} onChange={handleChange} required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Phone</Form.Label>
              <Form.Control type="tel" name="phone" value={form.phone} onChange={handleChange} required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Date of Birth</Form.Label>
              <Form.Control type="date" name="dob" value={form.dob} onChange={handleChange} required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Address</Form.Label>
              <Form.Control type="text" name="address" value={form.address} onChange={handleChange} required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Dispute Method</Form.Label>
              {/* Driven by the shared SERVICES list (utils/services.js)
                  instead of hardcoded options — this dropdown was missing
                  "Credit Repair"/Case Management entirely. */}
              <Form.Select name="dispute_method" value={form.dispute_method} onChange={handleChange} required>
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.disputeMethod}>{s.label}</option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Logins / Notes</Form.Label>
              <Form.Control as="textarea" rows={3} name="logins_notes" value={form.logins_notes} onChange={handleChange} required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Company</Form.Label>
              <Form.Select name="company_id" value={form.company_id} onChange={handleChange} disabled={!!companyId} required>
                <option value="">-- Select Company --</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.company_name}</option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Admin</Form.Label>
              <Form.Select name="admin_id" value={form.admin_id} onChange={handleChange} required>
                <option value="">-- Select Admin --</option>
                {admins.map((admin) => (
                  <option key={admin.id} value={admin.id}>{admin.full_name}</option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Assigned Agent *</Form.Label>
              <Form.Select 
                name="agent_id" 
                value={form.agent_id} 
                onChange={handleChange} 
                disabled={!form.company_id || companyAgents.length === 0}
                required 
              >
                <option value="">-- Select Agent --</option>
                {companyAgents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                        {agent.full_name} {agent.agent_code ? `(${agent.agent_code})` : ""}
                    </option>
                ))}
              </Form.Select>
              {form.company_id && companyAgents.length === 0 && (
                  <Form.Text className="text-warning small">No agents found for this company.</Form.Text>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-white">Upload Files (required)</Form.Label>
              <Form.Control
                type="file"
                multiple
                onChange={(e) => setFile(Array.from(e.target.files))}
                ref={fileInputRef}
                required
              />
              {file.length > 0 && (
                <ul className="text-white mt-2">
                  {file.map((f, i) => (
                    <li key={i}>{f.name}</li>
                  ))}
                </ul>
              )}
            </Form.Group>

            <Button type="submit" variant="primary" className="w-100">
              {uploading ? "Uploading..." : "Submit Client"}
            </Button>
          </form>

          {message && <div className="alert alert-info mt-3">{message}</div>}
        </div>
      </div>
    </>
  );
}