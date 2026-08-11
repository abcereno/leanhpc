import { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { supabase } from '../../supabaseClient'; 
import { useCompanyAuth } from '../../context/CompanyAuthContext';

export default function AddAgentModal({ show, handleClose, onAgentAdded }) {
  const { companyId } = useCompanyAuth();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (show) {
      setForm({ fullName: '', email: '', password: '' });
      setMessage('');
      setLoading(false);
    }
  }, [show]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    if (!companyId) {
      setMessage('❌ Error: Company ID not found.');
      setLoading(false);
      return;
    }

    try {
      // CALL BACKEND EDGE FUNCTION
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: 'agent',
          table: 'company_user_profiles', // Special table for agents
          data: {
            company_id: companyId, // Must pass company_id so agent is linked correctly
            full_name: form.fullName.trim(),
            email: form.email.trim()
          }
        }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setMessage(`✅ Agent “${form.fullName}” created!`);
      setForm({ fullName: '', email: '', password: '' });
      
      if (onAgentAdded) onAgentAdded();
      
      setTimeout(() => {
          handleClose();
          setMessage('');
      }, 1500);

    } catch (err) {
      console.error("Agent creation failed:", err);
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal show={show} onHide={handleClose} centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title><i className="bi bi-person-badge-plus me-2"></i>Add New Agent</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="info" className="small py-2 mb-3">
            <i className="bi bi-info-circle me-2"></i>
            Agents will log in via the main login page using these credentials.
        </Alert>

        <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Agent Code *</Form.Label>
              <Form.Control
                type="text"
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                placeholder="e.g. John Doe"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Agent Email *</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="agent@company.com"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Initial Password *</Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Set a secure initial password"
                required
                minLength={6}
              />
            </Form.Group>

            <Button variant="primary" type="submit" disabled={loading} className="w-100">
              {loading ? <Spinner as="span" size="sm" animation="border" className="me-2"/> : 'Create Agent Account'}
            </Button>
        </Form>
        
        {message && <Alert className="mt-3 text-center" variant={message.includes('✅') ? 'success' : 'danger'}>{message}</Alert>}
      </Modal.Body>
    </Modal>
  );
}