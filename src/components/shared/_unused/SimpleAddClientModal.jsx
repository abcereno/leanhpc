import React, { useState, useEffect } from "react";
import { Modal, Form, Button, Alert, Spinner } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";

export default function SimpleAddClientModal({ show, onClose, onClientAdded }) {
  const [companies, setCompanies] = useState([]);
  const [formData, setFormData] = useState({
    company_id: "",
    full_name: "",
    email: "",
    phone: "",
    notes: "" // Maps to logins_notes
  });
  
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [message, setMessage] = useState(null);

  // 1. Fetch Companies for Dropdown
  useEffect(() => {
    if (!show) return; // Only fetch when open
    const fetchCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("id, company_name")
          .order("company_name", { ascending: true });
        
        if (error) throw error;
        setCompanies(data || []);
      } catch (err) {
        console.error("Error fetching companies:", err);
      } finally {
        setLoadingCompanies(false);
      }
    };
    fetchCompanies();
  }, [show]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (!formData.company_id) {
        setMessage({ type: "danger", text: "Please select a company." });
        return;
    }
    if (!formData.full_name.trim()) {
        setMessage({ type: "danger", text: "Client Name is required." });
        return;
    }

    setLoading(true);

    try {
        const { error } = await supabase.from("clients").insert({
            company_id: formData.company_id,
            full_name: formData.full_name.toUpperCase(),
            email: formData.email || null,
            phone: formData.phone || null,
            logins_notes: formData.notes || null,
            dispute_method: "inquiry deletion", // Default for quick add
            status_stage: "new lead",
            created_at: new Date().toISOString()
        });

        if (error) throw error;

        setMessage({ type: "success", text: "Client added successfully!" });
        
        // Reset form
        setFormData({ company_id: "", full_name: "", email: "", phone: "", notes: "" });
        
        // Refresh parent list and close after delay
        if (onClientAdded) onClientAdded();
        setTimeout(() => {
            setMessage(null);
            onClose();
        }, 1500);

    } catch (err) {
        setMessage({ type: "danger", text: "Error: " + err.message });
    } finally {
        setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Add New Client</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {message && <Alert variant={message.type}>{message.text}</Alert>}

        <Form onSubmit={handleSubmit}>
            {/* Company Selection */}
            <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Assign to Company *</Form.Label>
                {loadingCompanies ? (
                    <div className="text-muted small"><Spinner size="sm" animation="border" /> Loading companies...</div>
                ) : (
                    <Form.Select 
                        name="company_id" 
                        value={formData.company_id} 
                        onChange={handleChange} 
                        autoFocus
                    >
                        <option value="">-- Select Company --</option>
                        {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.company_name}</option>
                        ))}
                    </Form.Select>
                )}
            </Form.Group>

            <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Full Name *</Form.Label>
                <Form.Control 
                    type="text" 
                    name="full_name" 
                    value={formData.full_name} 
                    onChange={handleChange} 
                    required 
                />
            </Form.Group>

            <div className="row">
                <div className="col-md-6 mb-3">
                    <Form.Label className="fw-bold">Email</Form.Label>
                    <Form.Control 
                        type="email" 
                        name="email" 
                        value={formData.email} 
                        onChange={handleChange} 
                    />
                </div>
                <div className="col-md-6 mb-3">
                    <Form.Label className="fw-bold">Phone</Form.Label>
                    <Form.Control 
                        type="tel" 
                        name="phone" 
                        value={formData.phone} 
                        onChange={handleChange} 
                    />
                </div>
            </div>

            <Form.Group className="mb-4">
                <Form.Label className="fw-bold">Notes</Form.Label>
                <Form.Control 
                    as="textarea" 
                    rows={2} 
                    name="notes" 
                    value={formData.notes} 
                    onChange={handleChange} 
                    placeholder="Optional notes..."
                />
            </Form.Group>

            <div className="d-flex justify-content-end gap-2">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit" disabled={loading}>
                    {loading ? <Spinner animation="border" size="sm" /> : "Add Client"}
                </Button>
            </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}