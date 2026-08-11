import React, { useState, useRef } from 'react';
import { Modal, Button, Form, Alert, Spinner, Row, Col, Card } from 'react-bootstrap';
import { supabase } from "../../../supabaseClient";

// 👇 IMPORT YOUR QR CODE HERE WHEN READY:
import zelleQrCode from '../../../assets/zelle.jpeg'; 

export default function UniversalPaymentModal({ show, onHide, serviceType, clientId, auditReport }) {
  const [paymentMethod, setPaymentMethod] = useState('card'); // 'card' or 'zelle'
  const [paymentPlan, setPaymentPlan] = useState('full'); // 'full' or 'split'
  const [file, setFile] = useState(null);
  const [manualAmount, setManualAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: '' }
  const fileInputRef = useRef();

  // 1. Calculate the Price based on the selected service
  const getPricingDetails = () => {
    if (serviceType === 'bootcamp') return { price: 79, title: "DIY Credit Bootcamp" };
    if (serviceType === 'vault') return { price: 497, title: "Education Vault" };

    // Classroom Pricing
    if (serviceType === 'classroom') return { price: 99, title: "Credit Classroom" };

    if (serviceType === 'processing') {
      const count = auditReport?.negatives?.length || 0;
      let price = 1500;
      if (count > 10 && count <= 20) price = 1800;
      else if (count > 20 && count <= 30) price = 2200;
      else if (count > 30) price = 2500;
      return { price, title: "Administrative Processing", isHighTicket: true };
    }

    // Main account activation (see IndividualLayout.jsx's lock screen) — there's
    // no fixed price here since it's whatever the client was individually quoted,
    // so this asks them to enter the amount instead of showing a fixed one.
    if (serviceType === 'account_activation') {
      return { price: null, title: "Account Activation", isManualAmount: true };
    }

    return { price: 0, title: "Unknown Service" };
  };

  const details = getPricingDetails();
  const amountDue = details.isManualAmount
    ? Number(manualAmount) || 0
    : details.isHighTicket && paymentPlan === 'split'
      ? Math.round(details.price / 3) + 50 // Example split math (e.g. $1500 -> 3 payments of $550)
      : details.price;

  // 2. Handle the Zelle Screenshot Upload Flow
  const handleZelleSubmit = async () => {
    if (!file) {
      setStatus({ type: 'danger', message: 'Please upload a screenshot of your Zelle receipt.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      // A. Upload File to Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${clientId}_${Date.now()}.${fileExt}`;
      const filePath = `zelle_receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // B. Create Verification Record in Database
      const { error: dbError } = await supabase
        .from('payment_verifications')
        .insert({
          client_id: clientId,
          service_type: serviceType,
          amount_due: amountDue,
          payment_method: 'zelle',
          screenshot_url: filePath,
          status: 'pending'
        });

      if (dbError) throw dbError;

      // C. Notify Admin (Optional webhook/notification)
      await supabase.from('notifications').insert({
          type: 'payment_verification',
          client_id: clientId,
          message: `New Zelle payment submitted for ${details.title} ($${amountDue}). Requires verification.`,
          status: 'unread'
      });

      setStatus({ 
        type: 'success', 
        message: '✅ Receipt uploaded! Your account will be unlocked as soon as our team verifies the payment.' 
      });
      
      // Auto-close after 3 seconds
      setTimeout(() => {
          onHide();
          setStatus(null);
      }, 3000);

    } catch (error) {
      console.error('Payment upload failed:', error);
      setStatus({ type: 'danger', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Stripe/Card Checkout
  const handleStripeCheckout = async () => {
    setLoading(true);
    setStatus(null);

    const amountInCents = Math.round(amountDue * 100);
    const tempPurchaseId = `DIRECT_${serviceType}_${Date.now()}`;

    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: { 
            type: serviceType,           // 👈 Added: Tells Edge Function what they are buying
            clientId: clientId,          // 👈 Added: Links payment to client
            productName: details.title,  // 👈 Added: Shows correct name on Stripe
            invoiceId: tempPurchaseId, 
            amount: amountInCents,
            returnUrl: window.location.href 
        }
      });

      if (error || data?.error) {
          throw new Error(data?.error || error?.message);
      }

      // Redirect securely to Stripe
      if (data?.url) {
          window.location.href = data.url;
      }

    } catch (err) {
      console.error("Stripe Error:", err);
      setStatus({ type: 'danger', message: `Checkout failed: ${err.message}` });
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (paymentMethod === 'zelle') handleZelleSubmit();
    else handleStripeCheckout();
  };

  // Reset state when modal opens/closes
  React.useEffect(() => {
    if (show) {
        setFile(null);
        setStatus(null);
        setManualAmount('');
        setPaymentPlan('full');
        // Account activation has no Stripe price to charge (amount is whatever
        // the client was individually quoted), so it's Zelle-receipt-only.
        setPaymentMethod(serviceType === 'account_activation' ? 'zelle' : 'card');
    }
  }, [show, serviceType]);

  if (!show || !serviceType) return null;

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static">
      <Modal.Header closeButton className="border-0 pb-0">
        <Modal.Title className="fw-bold">Complete Purchase</Modal.Title>
      </Modal.Header>
      <Modal.Body className="pt-3">
        
        {/* Order Summary */}
        <div className="bg-light p-3 rounded mb-4 border">
          <h6 className="fw-bold mb-1">{details.title}</h6>
          {details.isManualAmount ? (
            <small className="text-muted">Enter the amount you were quoted below.</small>
          ) : (
            <div className="d-flex justify-content-between align-items-end">
              <span className="text-muted small">Total Cost</span>
              <span className="fw-bold fs-5 text-success">${details.price.toLocaleString()}</span>
            </div>
          )}
        </div>

        {status && <Alert variant={status.type} className="small fw-medium">{status.message}</Alert>}

        {/* High Ticket Payment Plan Options */}
        {details.isHighTicket && (
            <div className="mb-4">
                <Form.Label className="small fw-bold text-muted text-uppercase">Payment Options</Form.Label>
                <Row className="g-2">
                    <Col xs={6}>
                        <Card 
                            className={`h-100 cursor-pointer border-2 ${paymentPlan === 'full' ? 'border-primary bg-primary bg-opacity-10' : 'border-light'}`}
                            onClick={() => setPaymentPlan('full')}
                        >
                            <Card.Body className="p-3 text-center">
                                <div className="fw-bold mb-1">Pay in Full</div>
                                <div className="h5 mb-0">${details.price.toLocaleString()}</div>
                                <small className="text-muted" style={{fontSize: '0.7rem'}}>One time</small>
                            </Card.Body>
                        </Card>
                    </Col>
                    <Col xs={6}>
                        <Card 
                            className={`h-100 cursor-pointer border-2 ${paymentPlan === 'split' ? 'border-primary bg-primary bg-opacity-10' : 'border-light'}`}
                            onClick={() => setPaymentPlan('split')}
                        >
                            <Card.Body className="p-3 text-center">
                                <div className="fw-bold mb-1">Payment Plan</div>
                                <div className="h5 mb-0">${amountDue.toLocaleString()}</div>
                                <small className="text-muted" style={{fontSize: '0.7rem'}}>3 monthly payments</small>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </div>
        )}

        {/* Payment Method Selector (hidden for account activation — Zelle-receipt-only) */}
        {!details.isManualAmount && (
          <Form.Group className="mb-4">
            <Form.Label className="small fw-bold text-muted text-uppercase">Payment Method</Form.Label>
            <div className="d-flex gap-2">
                <Button
                  variant={paymentMethod === 'card' ? 'dark' : 'outline-secondary'}
                  className="flex-grow-1 fw-bold"
                  onClick={() => setPaymentMethod('card')}
                >
                  <i className="bi bi-credit-card me-2"></i> Card / Apple Pay
                </Button>
                <Button
                  variant={paymentMethod === 'zelle' ? 'info' : 'outline-secondary'}
                  className={`flex-grow-1 fw-bold ${paymentMethod === 'zelle' ? 'text-white' : ''}`}
                  onClick={() => setPaymentMethod('zelle')}
                >
                  <i className="bi bi-phone me-2"></i> Zelle Transfer
                </Button>
            </div>
          </Form.Group>
        )}

        {/* Zelle Instructions & Upload */}
        {paymentMethod === 'zelle' && (
          <div className="bg-light border rounded p-3 mb-3">
            <h6 className="fw-bold text-info text-center mb-3">
              <i className="bi bi-info-circle-fill me-2"></i>Zelle Instructions
            </h6>

            <div className="text-center mb-3">
              <img
                src={zelleQrCode}
                alt="Zelle QR Code"
                className="img-fluid rounded shadow-sm border"
                style={{ width: "auto", height: "auto", objectFit: "cover" }}
              />
              <div className="small text-muted mt-2 fw-bold">Scan to open Zelle</div>
            </div>

            {details.isManualAmount && (
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">Amount Sent <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 149.00"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                />
              </Form.Group>
            )}

            <ol className="small text-muted ps-3 mb-3">
              <li>Open your banking app and select Zelle.</li>
              <li>
                Send {details.isManualAmount ? "the amount above" : (<>exactly <strong>${amountDue.toLocaleString()}</strong></>)} to{" "}
                <strong className="text-dark">studentcredit.info@gmail.com</strong>.
              </li>
              <li>Take a screenshot of the "Success" or "Sent" screen.</li>
              <li>Upload the screenshot below.</li>
            </ol>

            <Form.Group>
                <Form.Label className="small fw-bold">Upload Screenshot <span className="text-danger">*</span></Form.Label>
                <Form.Control
                    type="file"
                    accept="image/*"
                    size="sm"
                    onChange={(e) => setFile(e.target.files[0])}
                    ref={fileInputRef}
                />
            </Form.Group>
          </div>
        )}

      </Modal.Body>
      <Modal.Footer className="border-0 bg-light rounded-bottom">
        <Button variant="link" className="text-muted text-decoration-none" onClick={onHide} disabled={loading}>
          Cancel
        </Button>
        <Button 
            variant="primary" 
            className="fw-bold px-4 rounded-pill shadow-sm" 
            onClick={handleSubmit}
            disabled={loading || (paymentMethod === 'zelle' && (!file || (details.isManualAmount && amountDue <= 0)))}
        >
          {loading ? (
            <><Spinner size="sm" animation="border" className="me-2" /> Processing...</>
          ) : paymentMethod === 'zelle' ? (
            "Submit for Verification"
          ) : (
            `Pay $${amountDue.toLocaleString()}`
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}