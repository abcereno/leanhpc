import React, { useState, useEffect } from 'react';
import { Container, Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { useAffiliateAuth } from '../../context/AffiliateAuthContext';
import { supabase } from '../../supabaseClient';

export default function AffiliateProfile() {
  const { user, affiliateId, affiliateName: initialName } = useAffiliateAuth();
  
  // Form state
  const [affiliateName, setAffiliateName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Load initial affiliate name
  useEffect(() => {
    if (initialName) {
      setAffiliateName(initialName);
    }
  }, [initialName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    // 1. Password Update
    if (password) {
      if (password !== confirmPassword) {
        setMessage({ type: 'danger', text: 'Passwords do not match.' });
        setLoading(false);
        return;
      }
      
      const { error: passError } = await supabase.auth.updateUser({ password });
      if (passError) {
        setMessage({ type: 'danger', text: `Password update failed: ${passError.message}` });
        setLoading(false);
        return;
      }
    }

    // 2. Affiliate Name Update
    if (affiliateName && affiliateName !== initialName) {
      const { error: nameError } = await supabase
        .from('affiliates')
        .update({ affiliate_name: affiliateName })
        .eq('id', affiliateId);
      
      if (nameError) {
        setMessage({ type: 'danger', text: `Name update failed: ${nameError.message}` });
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    setMessage({ type: 'success', text: 'Profile updated successfully!' });
    setPassword('');
    setConfirmPassword('');
    // Note: The context will auto-update the name in the nav on next reload/session refresh
  };

  return (
    <Container>
      <Card className="shadow-sm border-0">
        <Card.Header as="h5">🤝 Edit Affiliate Profile</Card.Header>
        <Card.Body>
          {message.text && (
            <Alert variant={message.type}>{message.text}</Alert>
          )}
          
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="formEmail">
              <Form.Label>Email Address</Form.Label>
              <Form.Control
                type="email"
                value={user?.email || ''}
                disabled
                readOnly
              />
              <Form.Text className="text-muted">
                Your email address is your login and cannot be changed here.
              </Form.Text>
            </Form.Group>

            <Form.Group className="mb-3" controlId="formAffiliateName">
              <Form.Label>Affiliate / Referral Name</Form.Label>
              <Form.Control
                type="text"
                value={affiliateName}
                onChange={(e) => setAffiliateName(e.target.value)}
                placeholder="Your Affiliate Name"
              />
            </Form.Group>

            <hr className="my-4" />
            
            <h6 className="text-muted">Update Password</h6>
            
            <Form.Group className="mb-3" controlId="formPassword">
              <Form.Label>New Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
              />
            </Form.Group>

            <Form.Group className="mb-3" controlId="formConfirmPassword">
              <Form.Label>Confirm New Password</Form.Label>
              <Form.Control
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </Form.Group>

            <Button variant="primary" type="submit" disabled={loading}>
              {loading && <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />}
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}