import { useState, useEffect } from "react";
import { Modal, Button, Form, Alert, Spinner } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import useLogger from "../../../hooks/useLogger"; // 1. Import Logger
import { useToast } from "../../shared/ui/ToastNotifier";
import { SERVICES, deriveServiceId } from "../../../utils/services";

export default function BulkEditModal({ show, onClose, selectedIds, onSaved }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [companies, setCompanies] = useState([]);
  const [admins, setAdmins] = useState([]);
  
  // 2. Initialize Logger
  const logAction = useLogger();

  // Fields to update (empty = do not change)
  const [updates, setUpdates] = useState({
    admin_id: "",
    company_id: "",
    dispute_method: "",
    is_paused: "", // "true", "false", or ""
  });

  useEffect(() => {
    if (show) {
      setFetching(true);
      Promise.all([
        supabase.from("companies").select("id, company_name").order("company_name"),
        supabase.from("profiles").select("id, full_name").in("role", ["admin", "owner", "subadmin", "callers", "counter"]).order("full_name")
      ]).then(([compRes, adminRes]) => {
        if (compRes.data) setCompanies(compRes.data);
        if (adminRes.data) setAdmins(adminRes.data);
        setFetching(false);
      });
    }
  }, [show]);

  const handleChange = (e) => {
    setUpdates({ ...updates, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    const payload = {};
    const changesLog = []; // Track changes for logging
    
    // Only include fields that have a value
    if (updates.admin_id) { 
        payload.admin_id = updates.admin_id;
        changesLog.push("Assigned Admin");
    }
    if (updates.company_id) {
        payload.company_id = updates.company_id;
        changesLog.push("Assigned Company");
    }
    if (updates.dispute_method) {
        payload.dispute_method = updates.dispute_method;
        // Keep clients.service_id in sync — see utils/services.js /
        // sql/add_services.sql and the matching note in EditClientModal.jsx.
        payload.service_id = deriveServiceId(updates.dispute_method);
        changesLog.push(`Set Dispute Method to ${updates.dispute_method}`);
    }
    
    if (updates.is_paused !== "") {
      payload.is_paused = updates.is_paused === "true";
      if (payload.is_paused) {
        payload.paused_at = new Date().toISOString();
        changesLog.push("Paused Service");
      } else {
        payload.paused_at = null; 
        changesLog.push("Resumed Service");
      }
    }

    if (Object.keys(payload).length === 0) {
      addToast({ title: "No Changes", message: "No changes selected.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    if (!window.confirm(`Update ${selectedIds.length} clients?`)) return;

    setLoading(true);
    try {
      let { error } = await supabase
        .from("clients")
        .update(payload)
        .in("id", selectedIds);

      // Defensive: sql/add_services.sql may not have been run yet — degrade
      // gracefully rather than blocking the rest of this bulk update.
      if (error && "service_id" in payload && /service_id/i.test(error.message || "")) {
        console.warn("clients.service_id not found (run sql/add_services.sql) — saving without it.");
        const { service_id: _omit, ...withoutServiceId } = payload;
        ({ error } = await supabase.from("clients").update(withoutServiceId).in("id", selectedIds));
      }

      if (error) throw error;

      // [LOG BULK ACTION]
      await logAction({
        action: "bulk_update_clients",
        targetId: null, // Null because it affects multiple
        targetName: `${selectedIds.length} Clients`,
        details: `Bulk updated ${selectedIds.length} clients. Changes: ${changesLog.join(", ")}.`
      });

      addToast({ title: "Updated", message: "Bulk update successful!", variant: "success", icon: "bi-check-circle-fill" });
      onSaved(); // Trigger refresh in parent
      onClose();
    } catch (err) {
      addToast({ title: "Error", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fw-bold">
          <i className="bi bi-layers-half me-2"></i>
          Bulk Edit ({selectedIds.length})
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {fetching ? (
          <div className="text-center py-4"><Spinner animation="border" /></div>
        ) : (
          <Form>
            <Alert variant="info" className="small mb-3">
              <i className="bi bi-info-circle me-2"></i>
              Only fields you select below will be updated. Leave fields blank to keep existing data.
            </Alert>

            {/* Admin */}
            <Form.Group className="mb-3">
              <Form.Label>Assign Admin</Form.Label>
              <Form.Select name="admin_id" value={updates.admin_id} onChange={handleChange}>
                <option value="">(No Change)</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name}</option>
                ))}
              </Form.Select>
            </Form.Group>

            {/* Company */}
            <Form.Group className="mb-3">
              <Form.Label>Assign Company</Form.Label>
              <Form.Select name="company_id" value={updates.company_id} onChange={handleChange}>
                <option value="">(No Change)</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </Form.Select>
            </Form.Group>

            {/* Dispute Method */}
            <Form.Group className="mb-3">
              <Form.Label>Dispute Method</Form.Label>
              <Form.Select name="dispute_method" value={updates.dispute_method} onChange={handleChange}>
                <option value="">(No Change)</option>
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.disputeMethod}>{s.label}</option>
                ))}
              </Form.Select>
            </Form.Group>

            {/* Pause/Resume */}
            <Form.Group className="mb-3">
              <Form.Label>Service Status</Form.Label>
              <Form.Select name="is_paused" value={updates.is_paused} onChange={handleChange}>
                <option value="">(No Change)</option>
                <option value="true">Pause Service</option>
                <option value="false">Resume Service</option>
              </Form.Select>
            </Form.Group>
          </Form>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={loading || fetching}>
          {loading ? "Updating..." : "Apply Changes"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}