import { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { supabase } from '../../supabaseClient'; 
import { useCompanyAuth } from '../../context/CompanyAuthContext';

export default function BrokerAddAgentModal({ show, handleClose, onAgentAdded }) {
  const { companyId } = useCompanyAuth();
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Reset form cleanly every time the modal opens
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
    
    if (!companyId) {
      setMessage('❌ Error: Broker Company ID not found. Please refresh the page.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // 🚀 Call your Edge Function to securely create the Auth User
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          role: 'agent', // 👈 Update to 'broker_agent' if your backend requires a different role!
          table: 'company_user_profiles', 
          data: {
            company_id: companyId, // Locks this agent to the Broker's company
            full_name: form.fullName.trim(),
            email: form.email.trim()
          }
        }
      });

      // Catch edge function crashes
      if (error) throw new Error(error.message);
      // Catch custom errors returned by your edge function logic
      if (data?.error) throw new Error(data.error);

      setMessage(`✅ Success! Agent "${form.fullName}" has been created.`);
      setForm({ fullName: '', email: '', password: '' });
      
      // Trigger a refresh on the parent dashboard if needed
      if (onAgentAdded) onAgentAdded();
      
      // Auto-close after showing the success message
      setTimeout(() => {
          handleClose();
          setMessage('');
      }, 2000);

    } catch (err) {
      console.error("Broker Agent creation failed:", err);
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal show={show} onHide={handleClose} centered backdrop="static">
      <Modal.Header closeButton className="border-0 pb-0">
        <Modal.Title className="fw-bold text-primary">
          <i className="bi bi-person-badge-plus me-2"></i> Add Broker Agent
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="pt-2">
        <Alert variant="info" className="small py-2 mb-4 shadow-sm border-info">
            <i className="bi bi-info-circle-fill me-2"></i>
            Agents can log in to the portal immediately using these credentials. They will only see clients assigned to them.
        </Alert>

        <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold text-muted mb-1">Agent Full Name <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="text"
                name="fullName"
                value={form.fullName}
                onChange={handleChange}
                placeholder="e.g. John Doe"
                required
                className="shadow-sm"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold text-muted mb-1">Agent Email <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="agent@brokerage.com"
                required
                className="shadow-sm"
              />
            </Form.Group>

            <Form.Group className="mb-4">
              <Form.Label className="small fw-bold text-muted mb-1">Initial Password <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Set a secure initial password"
                required
                minLength={6}
                className="shadow-sm"
              />
            </Form.Group>

            {message && (
              <Alert className="text-center py-2 fw-bold shadow-sm" variant={message.includes('✅') ? 'success' : 'danger'}>
                {message}
              </Alert>
            )}

            <Button variant="primary" type="submit" disabled={loading} className="w-100 fw-bold shadow-sm py-2">
              {loading ? <Spinner as="span" size="sm" animation="border" className="me-2"/> : 'Create Agent Account'}
            </Button>
        </Form>
      </Modal.Body>
    </Modal>
  );
}