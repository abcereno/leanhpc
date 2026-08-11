import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient";
import useLogger from "../../../hooks/useLogger";
import { useToast } from "../../shared/ui/ToastNotifier";
import { SERVICES, deriveServiceId } from "../../../utils/services";
import { handleImagePaste } from "../../../utils/pasteImageUpload";

export default function EditClientModal({ clientId, show, onClose }) {
  const { addToast } = useToast();
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    dob: "",
    address: "",
    logins_notes: "",
    special_forms_notes: "",
    special_instructions_notes: "",
    company_id: "",
    admin_id: "",
    agent: "",      
    agent_id: "",   
    dispute_method: "",
  });

  const [companies, setCompanies] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [agents, setAgents] = useState([]); 
  const [loading, setLoading] = useState(true);
  
  const logAction = useLogger();

  // 1. Helper to fetch agents (with RPC bypass for Admins)
  const fetchAgentsForCompany = async (companyId) => {
    if (!companyId) {
      setAgents([]);
      return;
    }
    
    try {
        // FIRST: Try the RPC function to bypass RLS for Admins
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_company_agents', { target_company_id: companyId });
        
        if (!rpcError && rpcData && rpcData.length > 0) {
            setAgents(rpcData);
            return;
        }
        
        // FALLBACK: Standard query (Includes agent_code for display purposes)
        const { data, error } = await supabase
          .from("company_user_profiles")
          .select("id, full_name, role, agent_code")
          .eq("company_id", companyId)
          .in("role", ["agent", "company_agent"])
          .order("full_name");

        if (!error && data) {
          setAgents(data);
        } else {
          setAgents([]);
        }
    } catch (err) {
        console.error("Error fetching agents:", err);
        setAgents([]);
    }
  };

  useEffect(() => {
    if (!show) return;

    const fetchData = async () => {
      setLoading(true);

      const [clientRes, companyRes, adminRes] = await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).single(),
        supabase.from("companies").select("id, company_name").order("company_name"),
        supabase
          .from("profiles")
          .select("id, full_name")
          .in("role", ["admin", "owner", "subadmin", "callers", "counter"])
          .order("full_name"),
      ]);

      if (clientRes.data) {
        const data = clientRes.data;
        setFormData({
          full_name: data.full_name || "",
          email: data.email || "",
          phone: data.phone || "",
          dob: data.dob || "",
          address: data.address || "",
          logins_notes: data.logins_notes || "",
          special_forms_notes: data.special_forms_notes || "",
          special_instructions_notes: data.special_instructions_notes || "",
          company_id: data.company_id || "",
          admin_id: data.admin_id || "",
          agent: data.agent || "",
          agent_id: data.agent_id || "", 
          dispute_method: data.dispute_method || "",
        });

        if (data.company_id) {
          await fetchAgentsForCompany(data.company_id);
        }
      }

      if (companyRes.data) setCompanies(companyRes.data);
      if (adminRes.data) setAdmins(adminRes.data);

      setLoading(false);
    };

    fetchData();
  }, [clientId, show]);

  // 2. Handle Company Change
  const handleCompanyChange = async (e) => {
    const newCompanyId = e.target.value;
    setFormData((prev) => ({ 
      ...prev, 
      company_id: newCompanyId,
      agent_id: "", 
      agent: "",
    }));
    
    await fetchAgentsForCompany(newCompanyId);
  };

  // 3a. Handle Dropdown Selection
  const handleAgentSelect = (e) => {
    const selectedId = e.target.value;
    
    if (!selectedId) {
        setFormData((prev) => ({
            ...prev,
            agent_id: "",
            agent: ""
        }));
        return;
    }

    const selectedAgent = agents.find(a => a.id === selectedId);
    setFormData((prev) => ({
      ...prev,
      agent_id: selectedId, 
      agent: selectedAgent ? selectedAgent.full_name : ""
    }));
  };

  // 3b. Handle Manual Typing
  const handleAgentManualInput = (e) => {
    const manualName = e.target.value;
    setFormData((prev) => ({
      ...prev,
      agent: manualName,
      agent_id: ""
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Lets staff paste a screenshot straight into the Special Forms / High
  // Priority Notes box — uploads it and appends the resulting URL on a new
  // line (FormatNotes on ClientProfile.jsx already renders image URLs found
  // in this field as inline images, so nothing else needs to change to
  // display it).
  const handleSpecialNotesPaste = (e) => {
    handleImagePaste(
      e,
      (url) =>
        setFormData((prev) => ({
          ...prev,
          special_forms_notes: prev.special_forms_notes
            ? `${prev.special_forms_notes}\n${url}`
            : url,
        })),
      (err) =>
        addToast({
          title: "Image Upload Failed",
          message: err.message,
          variant: "danger",
          icon: "bi-exclamation-triangle-fill",
        })
    );
  };

  const handleSave = async () => {
    // FIX: Only construct payload with columns that actually exist in the 'clients' schema
    const payload = {
      full_name: formData.full_name,
      email: formData.email,
      phone: formData.phone,
      dob: formData.dob,
      address: formData.address,
      logins_notes: formData.logins_notes,
      special_forms_notes: formData.special_forms_notes,
      special_instructions_notes: formData.special_instructions_notes,
      dispute_method: formData.dispute_method,
      // Keep clients.service_id in sync whenever dispute_method changes here
      // — this is one of only two places (the other is BulkEditModal.jsx)
      // dispute_method changes on an already-existing client, so it's the
      // one spot that could otherwise let the two columns drift apart. See
      // utils/services.js / sql/add_services.sql.
      service_id: deriveServiceId(formData.dispute_method),
      agent: formData.agent,
      agent_id: formData.agent_id || null,
      company_id: formData.company_id || null,
      admin_id: formData.admin_id || null,
    };

    let { error } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", clientId);

    // Defensive: sql/add_services.sql may not have been run yet — degrade
    // gracefully rather than blocking every other field in this save.
    if (error && /service_id/i.test(error.message || "")) {
      console.warn("clients.service_id not found (run sql/add_services.sql) — saving without it.");
      const { service_id: _omit, ...withoutServiceId } = payload;
      ({ error } = await supabase.from("clients").update(withoutServiceId).eq("id", clientId));
    }

    if (error) {
      addToast({ title: "Update Failed", message: error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } else {
      await logAction({
        action: "update_client_info",
        targetId: clientId,
        targetName: formData.full_name,
        details: "Updated client details (Info, Company, or Agent assignment)."
      });

      window.dispatchEvent(new CustomEvent('client-updated', { detail: { id: clientId } }));
      addToast({ title: "Client Updated", message: `${formData.full_name || "Client"}'s details were saved.`, variant: "success", icon: "bi-check-circle-fill" });

      onClose();
    }
  };

  if (!show) return null;

  return (
    <div
      className="modal show fade d-block"
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      aria-modal="true"
    >
      <div className="modal-dialog" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Edit Client Info</h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>

          <div className="modal-body">
            {loading ? (
              <div className="modal-body placeholder-glow">
                {[...Array(4)].map((_, i) => (
                  <div className="placeholder col-12 mb-3" key={i}></div>
                ))}
              </div>
            ) : (
              <>
                {/* Standard Fields */}
                {["full_name", "email", "phone", "address", "logins_notes"].map((field) => (
                  <div className="mb-3" key={field}>
                    <label className="form-label text-capitalize">
                      {field.replace("_", " ")}
                    </label>
                    {field === "logins_notes" ? (
                      <textarea
                        className="form-control"
                        name={field}
                        rows={3}
                        value={formData[field]}
                        onChange={handleChange}
                      />
                    ) : (
                      <input
                        className="form-control"
                        type="text"
                        name={field}
                        value={formData[field]}
                        onChange={handleChange}
                      />
                    )}
                  </div>
                ))}

                {/* Special Forms / High Priority Notes — triggers the
                    "HIGH PRIORITY" popup on ClientProfile.jsx load (see
                    special_forms_notes there). Previously only settable at
                    intake with no way to edit or clear it afterward. */}
                <div className="mb-3 p-2 border border-danger rounded">
                  <label className="form-label fw-bold text-danger">
                    <i className="bi bi-exclamation-octagon-fill me-2"></i>Special Forms / High Priority Notes
                  </label>
                  <textarea
                    className="form-control border-danger"
                    name="special_forms_notes"
                    rows={3}
                    value={formData.special_forms_notes}
                    onChange={handleChange}
                    onPaste={handleSpecialNotesPaste}
                    placeholder="Critical info that must be seen immediately (special handling, unique instructions)... paste a screenshot to attach it"
                  />
                  <div className="form-text text-danger small">
                    Triggers the high-priority popup every time this client's profile is opened. Clear this field to stop it. You can paste a screenshot directly into this box.
                  </div>
                </div>

                {/* Special Instructions — shown as an info alert on the
                    profile. Previously only appendable from a separate
                    Customer Service dashboard tab; editable here directly
                    now. */}
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    <i className="bi bi-info-circle me-2"></i>Special Instructions
                  </label>
                  <textarea
                    className="form-control"
                    name="special_instructions_notes"
                    rows={3}
                    value={formData.special_instructions_notes}
                    onChange={handleChange}
                    placeholder="Special instructions shown on the client's profile..."
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Date Of Birth:</label>
                  <input
                    type="date"
                    className="form-control"
                    name="dob"
                    value={formData.dob ? formData.dob.slice(0, 10) : ""}
                    onChange={handleChange}
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    <i className="bi bi-person me-2"></i>Dispute Method *
                  </label>
                  <select
                    name="dispute_method"
                    className="form-select"
                    value={formData.dispute_method}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select a method</option>
                    {SERVICES.map((s) => (
                      <option key={s.id} value={s.disputeMethod}>{s.label}</option>
                    ))}
                  </select>
                </div>

                {/* Company Dropdown */}
                <div className="mb-3">
                  <label className="form-label">Company</label>
                  <select
                    className="form-select"
                    name="company_id"
                    value={formData.company_id}
                    onChange={handleCompanyChange}
                  >
                    <option value="">-- No Company --</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.company_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* --- AGENT SECTION --- */}
                <div className="mb-3">
                  <label className="form-label">Agent <span className="text-muted fw-normal">(Optional)</span></label>
                  
                  {/* 1. Select Dropdown */}
                  <div className="input-group mb-2">
                    <span className="input-group-text bg-light text-muted">
                      <i className="bi bi-link-45deg"></i>
                    </span>
                    <select
                      className="form-select"
                      value={formData.agent_id} 
                      onChange={handleAgentSelect}
                      disabled={!formData.company_id || agents.length === 0}
                    >
                      <option value="">
                          {!formData.company_id 
                              ? "Select Company First" 
                              : agents.length === 0 
                                  ? "No agents found in this company" 
                                  : "-- Unassigned / No Agent --"}
                      </option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.full_name} {agent.agent_code ? `(${agent.agent_code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Manual Input */}
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Or type agent name manually..."
                    value={formData.agent} 
                    onChange={handleAgentManualInput}
                  />
                  <div className="form-text text-muted small">
                    Leave blank for no agent, select from the list to link a system user, or type to set a manual name.
                  </div>
                </div>

                {/* Admin Dropdown */}
                <div className="mb-3">
                  <label className="form-label">Admin</label>
                  <select
                    className="form-select"
                    name="admin_id"
                    value={formData.admin_id}
                    onChange={handleChange}
                  >
                    <option value="">Select an admin</option>
                    {admins.map((admin) => (
                      <option key={admin.id} value={admin.id}>
                        {admin.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}