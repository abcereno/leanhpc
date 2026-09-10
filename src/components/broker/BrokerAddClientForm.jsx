import React, { useState } from "react";
import { Form, Button, Alert, Spinner } from "react-bootstrap";
import { useCompanyAuth } from "../../context/CompanyAuthContext";
import { useConfirm } from "../shared/ui/ConfirmDialog";
import { resolveRoundForNewClient, insertClientRecord } from "../../utils/clientDuplicateRound";

export default function BrokerAddClientForm({ companyId, onSuccess }) {
  // [UPDATE] Destructure isCompanyAdmin to allow them to be agents too
  const { user, isAgent, isCompanyAdmin, fullName } = useCompanyAuth();
  const { confirm } = useConfirm();
  
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    notes: ""
  });
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
        setMessage({ type: "danger", text: "Client Name is required." });
        return;
    }
    if (!formData.email.trim()) {
        setMessage({ type: "danger", text: "Client email is required." });
        return;
    }
    if (!companyId) {
        setMessage({ type: "danger", text: "System Error: No Company ID found." });
        return;
    }

    setLoading(true);
    setMessage(null);

    try {
        // Warn-and-confirm on a returning email instead of silently creating
        // a duplicate — see utils/clientDuplicateRound.js.
        const disputeRound = await resolveRoundForNewClient(formData.email, confirm);
        if (disputeRound === null) {
            setMessage({ type: "warning", text: "Canceled — this email already belongs to an existing client." });
            setLoading(false);
            return;
        }

        // [FIXED LOGIC] Determine Agent Assignment
        // Allow BOTH Agents AND Company Admins to be assigned as the "Agent" for the lead
        const shouldAssign = isAgent || isCompanyAdmin;

        const assignedAgentId = shouldAssign ? user.id : null;
        const assignedAgentName = shouldAssign ? (fullName || user.user_metadata?.full_name || 'Agent') : null;

        const { error } = await insertClientRecord({
            company_id: companyId,
            full_name: formData.full_name.toUpperCase(),
            email: formData.email,
            phone: formData.phone || null,
            logins_notes: formData.notes || null,
            dispute_method: "inquiry deletion",
            dispute_round: disputeRound,

            // [FIXED] Now assigns ID for Admins too
            agent_id: assignedAgentId,
            agent: assignedAgentName,

            created_at: new Date().toISOString()
        });

        if (error) throw error;

        setMessage({ type: "success", text: "Referral submitted successfully!" });
        setFormData({ full_name: "", email: "", phone: "", notes: "" });
        
        if (onSuccess) onSuccess();

    } catch (err) {
        console.error("Broker add error:", err);
        setMessage({ type: "danger", text: "Error: " + err.message });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="p-3">
        {message && (
            <Alert variant={message.type} onClose={() => setMessage(null)} dismissible>
                {message.text}
            </Alert>
        )}

        <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Client Full Name *</Form.Label>
                <Form.Control 
                    type="text" 
                    name="full_name" 
                    value={formData.full_name} 
                    onChange={handleChange} 
                    placeholder="e.g. John Doe"
                    required 
                />
            </Form.Group>

            <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Email Address *</Form.Label>
                <Form.Control
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="client@example.com"
                    required
                />
            </Form.Group>

            <Form.Group className="mb-3">
                <Form.Label className="fw-bold">Phone Number</Form.Label>
                <Form.Control 
                    type="tel" 
                    name="phone" 
                    value={formData.phone} 
                    onChange={handleChange} 
                    placeholder="(555) 123-4567"
                />
            </Form.Group>

            <Form.Group className="mb-4">
                <Form.Label className="fw-bold">Notes / Instructions</Form.Label>
                <Form.Control 
                    as="textarea" 
                    rows={3} 
                    name="notes" 
                    value={formData.notes} 
                    onChange={handleChange} 
                    placeholder="Any specific details..."
                />
            </Form.Group>

            <div className="d-grid">
                <Button variant="primary" type="submit" disabled={loading} size="lg">
                    {loading ? <Spinner animation="border" size="sm" /> : "Submit Referral"}
                </Button>
            </div>
        </Form>
    </div>
  );
}