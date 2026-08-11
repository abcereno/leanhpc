import React, { useState } from 'react';
import { Form, Button, Spinner, Alert, Card, Container } from 'react-bootstrap';

export default function ClientIntakeForm() {
  const [formData, setFormData] = useState({ fullName: '', email: '', phone: '' });
  const [status, setStatus] = useState({ loading: false, success: false, error: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ loading: true, success: false, error: '' });

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-intake-client`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          // 👇 Hardcoded Company ID and Null Agent ID 👇
          companyId: "e33ef166-d381-458e-a5c8-ac77557d5ea2",
          agentId: null,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to process intake.');

      setStatus({ loading: false, success: true, error: '' });
      setFormData({ fullName: '', email: '', phone: '' });

    } catch (err) {
      setStatus({ loading: false, success: false, error: err.message });
    }
  };

  if (status.success) {
    return (
      <div className="intake-wrapper d-flex align-items-center justify-content-center min-vh-100 w-100">
        <Container className="py-5 text-center">
          <i className="bi bi-check-circle-fill text-success mb-3 shadow-sm rounded-circle" style={{ fontSize: '4rem', textShadow: '0 0 20px rgba(16, 185, 129, 0.4)' }}></i>
          <h2 className="fw-bold mt-3 text-white">Thank You!</h2>
          <p className="text-muted">Your information has been securely submitted. Our team will contact you shortly.</p>
          <Button 
            variant="outline-info" 
            className="mt-3 fw-bold px-4 py-2" 
            onClick={() => setStatus({ loading: false, success: false, error: '' })}
            style={{ borderRadius: '8px' }}
          >
              Submit Another Client
          </Button>
        </Container>
      </div>
    );
  }

  return (
    <div className="intake-wrapper d-flex align-items-center justify-content-center min-vh-100 w-100">
      <Card className="glass-card rounded-4 mx-3 w-100" style={{ maxWidth: '440px' }}>
        <Card.Body className="p-4 p-md-5">
          <div className="text-center mb-4">
            <div className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3" style={{ width: '56px', height: '56px', backgroundColor: 'rgba(56, 189, 248, 0.1)' }}>
              <i className="bi bi-layers-fill fs-3" style={{ color: '#38bdf8' }}></i>
            </div>
            <h4 className="fw-bold text-white mb-1">Client Intake</h4>
            <p className="small m-0" style={{ color: '#94a3b8' }}>Enter client details to prepare their file.</p>
          </div>

          {status.error && <Alert variant="danger" className="small fw-bold border-0" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171' }}>{status.error}</Alert>}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3 position-relative">
              <Form.Label className="small fw-bold text-uppercase" style={{ color: '#64748b', fontSize: '0.7rem', letterSpacing: '0.5px' }}>Full Name</Form.Label>
              <div className="position-relative">
                <i className="bi bi-person input-icon-wrapper"></i>
                <Form.Control 
                  type="text" 
                  required 
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  className="premium-input py-2"
                />
              </div>
            </Form.Group>

            <Form.Group className="mb-3 position-relative">
              <Form.Label className="small fw-bold text-uppercase" style={{ color: '#64748b', fontSize: '0.7rem', letterSpacing: '0.5px' }}>Email Address</Form.Label>
              <div className="position-relative">
                <i className="bi bi-envelope input-icon-wrapper"></i>
                <Form.Control 
                  type="email" 
                  required 
                  placeholder="name@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="premium-input py-2"
                />
              </div>
            </Form.Group>

            <Form.Group className="mb-4 position-relative">
              <Form.Label className="small fw-bold text-uppercase" style={{ color: '#64748b', fontSize: '0.7rem', letterSpacing: '0.5px' }}>Phone Number</Form.Label>
              <div className="position-relative">
                <i className="bi bi-telephone input-icon-wrapper"></i>
                <Form.Control 
                  type="tel" 
                  required 
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="premium-input py-2"
                />
              </div>
            </Form.Group>

            <Button type="submit" className="submit-btn w-100 fw-bold py-2 mt-2 d-flex align-items-center justify-content-center" disabled={status.loading}>
              {status.loading ? (
                <Spinner size="sm" animation="border" className="me-2" />
              ) : (
                <>Submit Securely <i className="bi bi-lock-fill ms-2"></i></>
              )}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}