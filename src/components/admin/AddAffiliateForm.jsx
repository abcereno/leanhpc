import { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Form, Button, Container, Card, Alert, Spinner } from 'react-bootstrap';

export default function AddAffiliateForm({ onAffiliateAdded }) {
  const [form, setForm] = useState({
    affiliate_name: '',
    contact_email: '',
    contact_phone: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const affiliate_name = form.affiliate_name.trim();
    const contact_email = form.contact_email.trim().toLowerCase();
    const contact_phone = form.contact_phone.trim() || null;
    const password = form.password;

    if (!affiliate_name || !contact_email || !password) {
      setMessage('❌ Name, Email, and Password are required.');
      setLoading(false);
      return;
    }

    try {
      // CALL BACKEND EDGE FUNCTION
      // This creates the Auth User and the DB entry safely on the server side.
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: contact_email,
          password: password,
          fullName: affiliate_name,
          role: 'affiliate',
          table: 'affiliates', // Target table
          data: {
            affiliate_name: affiliate_name,
            contact_email: contact_email,
            contact_phone: contact_phone,
            status: 'active'
          }
        }
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setMessage(`✅ Affiliate “${affiliate_name}” created successfully!`);
      setForm({
        affiliate_name: '',
        contact_email: '',
        contact_phone: '',
        password: '',
      });

      if (onAffiliateAdded) onAffiliateAdded();

    } catch (err) {
      console.error("Affiliate creation failed:", err);
      setMessage(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container className="mt-4">
      <Card className="shadow-sm">
        <Card.Header>
          <Card.Title as="h4">
            <i className="bi bi-person-plus-fill me-2"></i>
            Create New Affiliate
          </Card.Title>
        </Card.Header>
        <Card.Body>
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="affiliate_name">
              <Form.Label>Full Name *</Form.Label>
              <Form.Control
                type="text"
                name="affiliate_name"
                value={form.affiliate_name}
                onChange={handleChange}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="contact_email">
              <Form.Label>Contact Email (Login) *</Form.Label>
              <Form.Control
                type="email"
                name="contact_email"
                value={form.contact_email}
                onChange={handleChange}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="contact_phone">
                <Form.Label>Contact Phone</Form.Label>
                <Form.Control
                type="tel"
                name="contact_phone"
                value={form.contact_phone}
                onChange={handleChange}
                />
            </Form.Group>

            <Form.Group className="mb-3" controlId="password">
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
              {loading ? <Spinner as="span" size="sm" animation="border" className="me-2"/> : 'Create Affiliate'}
            </Button>
          </Form>

          {message && <Alert className="mt-4 text-center" variant={message.includes('✅') ? 'success' : 'danger'}>{message}</Alert>}
        </Card.Body>
      </Card>
    </Container>
  );
}