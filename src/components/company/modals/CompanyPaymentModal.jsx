import React, { useState, useRef } from 'react';
import { Modal, Button, Form, Alert, Spinner, Row, Col } from 'react-bootstrap';
import { supabase } from "../../../supabaseClient";
import zelleQrCode from '../../../assets/zelle.jpeg';

/**
 * Company-side receipt upload, mirroring the individual portal's
 * UniversalPaymentModal.jsx (same Zelle-screenshot-upload pattern, same
 * payment_verifications table + payment-proofs bucket) but scoped to a
 * company_id instead of a client_id, and Zelle-only since there's no
 * Stripe flow for partner subscriptions.
 *
 * Submitted receipts show up for review in AddCompanyForm.jsx's "Manage
 * Partner Subscriptions" tab (inline Receipt column), not in
 * AdminPaymentVerifications.jsx — that page is individual-receipts-only,
 * see its query in fetchPendingVerifications().
 */
export default function CompanyPaymentModal({ show, onHide, companyId, companyName }) {
  const [file, setFile] = useState(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef();

  React.useEffect(() => {
    if (show) {
      setFile(null);
      setAmount('');
      setStatus(null);
    }
  }, [show]);

  const amountDue = Number(amount) || 0;

  const handleSubmit = async () => {
    if (!file) {
      setStatus({ type: 'danger', message: 'Please upload a screenshot of your Zelle receipt.' });
      return;
    }
    if (amountDue <= 0) {
      setStatus({ type: 'danger', message: 'Please enter the amount you sent.' });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${companyId}_${Date.now()}.${fileExt}`;
      const filePath = `company_receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('payment_verifications')
        .insert({
          company_id: companyId,
          service_type: 'company_subscription',
          amount_due: amountDue,
          payment_method: 'zelle',
          screenshot_url: filePath,
          status: 'pending'
        });

      if (dbError) throw dbError;

      await supabase.from('notifications').insert({
        type: 'payment_verification',
        message: `New Zelle payment submitted by ${companyName || 'a company partner'} ($${amountDue}). Requires verification.`,
        status: 'unread'
      });

      setStatus({
        type: 'success',
        message: '✅ Receipt uploaded! Your account will be unlocked as soon as our team verifies the payment.'
      });

      setTimeout(() => {
        onHide();
        setStatus(null);
      }, 3000);

    } catch (error) {
      console.error('Company payment upload failed:', error);
      setStatus({ type: 'danger', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static" size="lg">
      <Modal.Header closeButton className="border-0 pb-0">
        <Modal.Title className="fw-bold">Upload Payment Receipt</Modal.Title>
      </Modal.Header>
      <Modal.Body className="pt-3">
        {status && <Alert variant={status.type} className="small fw-medium">{status.message}</Alert>}

        <Row className="g-4">
          <Col md={5} className="text-center">
            <img
              src={zelleQrCode}
              alt="Zelle QR Code"
              className="img-fluid rounded shadow-sm border"
              style={{ maxWidth: 220 }}
            />
            <div className="small text-muted mt-2 fw-bold">Scan to open Zelle</div>
          </Col>

          <Col md={7}>
            <h6 className="fw-bold text-info mb-3">
              <i className="bi bi-info-circle-fill me-2"></i>Zelle Instructions
            </h6>

            <ol className="small text-muted ps-3 mb-3">
              <li>Open your banking app and select Zelle.</li>
              <li>Send the amount below to <strong className="text-dark">studentcredit.info@gmail.com</strong>.</li>
              <li>Take a screenshot of the "Success" or "Sent" screen.</li>
              <li>Upload the screenshot below.</li>
            </ol>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-bold">Amount Sent <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 299.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Form.Group>

            <Form.Group>
              <Form.Label className="small fw-bold">Upload Screenshot <span className="text-danger">*</span></Form.Label>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files[0])}
                ref={fileInputRef}
              />
            </Form.Group>
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer className="border-0 bg-light rounded-bottom">
        <Button variant="link" className="text-muted text-decoration-none" onClick={onHide} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="fw-bold px-4 rounded-pill shadow-sm"
          onClick={handleSubmit}
          disabled={loading || !file || amountDue <= 0}
        >
          {loading ? (
            <><Spinner size="sm" animation="border" className="me-2" /> Uploading...</>
          ) : (
            "Submit for Verification"
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
