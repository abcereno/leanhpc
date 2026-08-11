import React, { useState } from 'react';
import { Modal, Button, Form, Spinner, InputGroup, Alert, Row, Col } from 'react-bootstrap';
import { supabase } from '../../../supabaseClient';
import { useToast } from '../../shared/ui/ToastNotifier';

export default function GenerateInvoiceModal({ show, onHide }) {
  const { addToast } = useToast();
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('Credit Repair Initial Setup');
  
  const [loading, setLoading] = useState(false);
  const [paymentLink, setPaymentLink] = useState(null);
  const [error, setError] = useState(null);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 🚨 CRITICAL: We convert the dollar amount to cents here!
      // Example: $150.00 becomes 15000 cents for Stripe.
      const amountInCents = Math.round(parseFloat(amount) * 100);
      
      if (isNaN(amountInCents) || amountInCents <= 0) {
          throw new Error("Please enter a valid amount greater than $0.");
      }

      const { data: stripeData, error: stripeErr } = await supabase.functions.invoke('create-stripe-checkout', {
        body: {
          type: 'new_client_invoice',
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim(),
          description: description,
          amount: amountInCents,
          returnUrl: `${window.location.origin}/payment-success` 
        }
      });

      if (stripeErr || stripeData?.error) {
        throw new Error(stripeData?.error || stripeErr?.message || "Stripe failed to generate link.");
      }

      if (stripeData?.url) {
        setPaymentLink(stripeData.url);
        addToast({ title: "Payment Link Ready", message: `Generated for ${clientName || "client"}.`, variant: "success", icon: "bi-link-45deg" });
      }

    } catch (err) {
      console.error(err);
      setError(err.message);
      addToast({ title: "Failed to Generate Link", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(paymentLink);
    addToast({ title: "Copied", message: "Link copied — paste it anywhere if they didn't get the email.", variant: "success", icon: "bi-clipboard-check-fill", timeout: 3500 });
  };

  const resetAndClose = () => {
    setClientName('');
    setClientEmail('');
    setAmount('');
    setDescription('Credit Repair Initial Setup');
    setPaymentLink(null);
    setError(null);
    onHide();
  };

  return (
    <Modal show={show} onHide={resetAndClose} centered backdrop="static" size="lg">
      <Modal.Header closeButton className="bg-light">
        <Modal.Title className="fw-bold h5 mb-0">
            <i className="bi bi-envelope-paper-heart text-primary me-2"></i> 
            Email Invoice to New Lead
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="p-4">
        {error && <Alert variant="danger">{error}</Alert>}

        {!paymentLink ? (
            <Form onSubmit={handleGenerate}>
              <h6 className="fw-bold text-muted mb-3 border-bottom pb-2">1. Client Details</h6>
              <Row className="mb-4">
                  <Col md={6}>
                      <Form.Group>
                          <Form.Label className="small fw-bold">Full Name</Form.Label>
                          <Form.Control type="text" value={clientName} onChange={e => setClientName(e.target.value)} required placeholder="John Doe" />
                      </Form.Group>
                  </Col>
                  <Col md={6}>
                      <Form.Group>
                          <Form.Label className="small fw-bold">Email Address</Form.Label>
                          <Form.Control type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} required placeholder="onboarding@resend.dev" />
                      </Form.Group>
                  </Col>
              </Row>

              <h6 className="fw-bold text-muted mb-3 border-bottom pb-2">2. Invoice Details</h6>
              <Row className="mb-4">
                  <Col md={4}>
                      <Form.Group>
                          <Form.Label className="small fw-bold">Amount to Bill</Form.Label>
                          <InputGroup>
                            <InputGroup.Text>$</InputGroup.Text>
                            <Form.Control type="number" step="0.01" min="1" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="150.00" />
                          </InputGroup>
                      </Form.Group>
                  </Col>
                  <Col md={8}>
                      <Form.Group>
                        <Form.Label className="small fw-bold">Description (Visible on Receipt)</Form.Label>
                        <Form.Control type="text" value={description} onChange={e => setDescription(e.target.value)} required />
                      </Form.Group>
                  </Col>
              </Row>

              <Button variant="primary" type="submit" className="w-100 fw-bold py-2 shadow-sm" disabled={loading}>
                {loading ? <Spinner size="sm" animation="border" className="me-2"/> : <i className="bi bi-send-fill me-2"></i>}
                {loading ? "Generating & Sending..." : "Generate Link & Send Email"}
              </Button>
            </Form>
        ) : (
            <div className="text-center py-3 px-3">
                <div className="text-success mb-3"><i className="bi bi-send-check-fill display-3"></i></div>
                <h4 className="fw-bold mb-2">Invoice Sent!</h4>
                <p className="text-muted mb-4">
                    An email containing the secure payment link has been delivered to <strong className="text-dark">{clientEmail}</strong>. 
                    Once they pay, the system will automatically create their portal account.
                </p>
                
                <div className="bg-light p-2 rounded border text-muted mb-3 small d-flex justify-content-between align-items-center">
                    <span className="text-truncate text-start pe-3" style={{maxWidth: '80%'}}>{paymentLink}</span>
                    <Button variant="outline-secondary" size="sm" onClick={handleCopy} className="text-nowrap">
                        <i className="bi bi-clipboard"></i> Copy
                    </Button>
                </div>
                
                <Button variant="primary" onClick={resetAndClose} className="w-100 fw-bold">
                    Done
                </Button>
            </div>
        )}
      </Modal.Body>
    </Modal>
  );
}