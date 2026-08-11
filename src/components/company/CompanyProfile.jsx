import React, { useState, useEffect } from 'react';
import { Container, Card, Form, Button, Spinner, Alert } from 'react-bootstrap';
import { useCompanyAuth } from '../../context/CompanyAuthContext';
import { supabase } from '../../supabaseClient';

export default function CompanyProfile() {
  // Use the new role flags and fullName from context
  const { user, companyId, companyName: initialCompanyName, fullName: initialUserFullName, isCompanyAdmin } = useCompanyAuth();
  
  const [companyName, setCompanyName] = useState('');
  const [userFullName, setUserFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (initialCompanyName) setCompanyName(initialCompanyName);
    if (initialUserFullName) setUserFullName(initialUserFullName);
  }, [initialCompanyName, initialUserFullName]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      // 1. Password Update (Global for any user type)
      if (password) {
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }
        const { error: passError } = await supabase.auth.updateUser({ password });
        if (passError) throw passError;
      }

      // 2. Personal Name Update (Updates the individual agent/admin profile)
      if (userFullName && userFullName !== initialUserFullName) {
        const { error: profileError } = await supabase
          .from('company_user_profiles')
          .update({ full_name: userFullName })
          .eq('id', user.id); // Restricted to current user ID
        
        if (profileError) throw profileError;
      }

      // 3. Company Name Update (RESTRICTED TO ADMINS ONLY)
      if (isCompanyAdmin && companyName && companyName !== initialCompanyName) {
        const { error: nameError } = await supabase
          .from('companies')
          .update({ company_name: companyName })
          .eq('id', companyId);
        
        if (nameError) throw nameError;
      }

      setMessage({ type: 'success', text: '✅ Profile updated successfully!' });
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="mt-4">
      <Card className="shadow-sm border-0">
        <Card.Header as="h5" className="bg-white text-info py-3">
          <i className="bi bi-person-gear me-2"></i>My Profile Settings
        </Card.Header>
        <Card.Body className="p-4">
          {message.text && (
            <Alert variant={message.type} className="text-center">{message.text}</Alert>
          )}
          
          <Form onSubmit={handleSubmit}>
            {/* EMAIL SECTION (Read Only) */}
            <Form.Group className="mb-4">
              <Form.Label className="fw-bold text-secondary">Email Address</Form.Label>
              <Form.Control
                type="email"
                value={user?.email || ''}
                disabled
                readOnly
                className="bg-light opacity-75" 
              />
            </Form.Group>

            {/* PERSONAL NAME SECTION (All Users) */}
            <Form.Group className="mb-4" controlId="formFullName">
              <Form.Label className="fw-bold text-info">Your Full Name</Form.Label>
              <Form.Control
                type="text"
                value={userFullName}
                onChange={(e) => setUserFullName(e.target.value)}
                placeholder="Enter your name"
                required
              />
            </Form.Group>

            {/* COMPANY NAME SECTION (Restricted UI) */}
            <Form.Group className="mb-4" controlId="formCompanyName">
              <Form.Label className="fw-bold text-info">Company Entity Name</Form.Label>
              <Form.Control
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company Name"
                disabled={!isCompanyAdmin} // Locked for Agents
                readOnly={!isCompanyAdmin}
                className={!isCompanyAdmin ? "bg-light opacity-75" : "border-info-subtle"}
              />
              {!isCompanyAdmin && (
                <Form.Text className="text-muted">
                  <i className="bi bi-lock-fill me-1"></i> Only company administrators can change the entity name.
                </Form.Text>
              )}
            </Form.Group>

            <hr className="my-4 opacity-25" />
            
            <h6 className="text-info mb-3 text-uppercase small fw-bold">Update Security</h6>
            
            <Form.Group className="mb-3" controlId="formPassword">
              <Form.Label className="small text-secondary">New Password</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
              />
            </Form.Group>

            <Form.Group className="mb-4" controlId="formConfirmPassword">
              <Form.Label className="small text-secondary">Confirm New Password</Form.Label>
              <Form.Control
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </Form.Group>

            <Button variant="info" type="submit" className="text-white w-100 fw-bold py-2" disabled={loading}>
              {loading ? (
                <><Spinner size="sm" className="me-2" />Saving...</>
              ) : (
                'Save Profile Changes'
              )}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
}