import React, { useState, useEffect } from 'react';
import { supabase } from "../../supabaseClient";
import { Card, Table, Badge, Button, Spinner, Alert, Modal } from 'react-bootstrap';
import { useToast } from "../shared/ui/ToastNotifier";
import { useConfirm } from "../shared/ui/ConfirmDialog";
import { markClientPaid } from "../../utils/markClientPaid";

export default function AdminPaymentVerifications() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [message, setMessage] = useState("");
  
  // Image Viewer Modal State
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    fetchPendingVerifications();
  }, []);

  const fetchPendingVerifications = async () => {
    setLoading(true);
    try {
      // Fetch pending verifications and join with the clients table to get their name.
      // Company-submitted receipts (company_id set, client_id null) are excluded here —
      // those are reviewed inline in AddCompanyForm.jsx's "Manage Partner Subscriptions"
      // tab instead, so a receipt only ever shows up in one review queue.
      const { data, error } = await supabase
        .from('payment_verifications')
        .select(`
          *,
          clients ( full_name, email )
        `)
        .eq('status', 'pending')
        .not('client_id', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVerifications(data || []);
    } catch (err) {
      console.error("Error fetching verifications:", err);
      setMessage("❌ Failed to load pending payments.");
    } finally {
      setLoading(false);
    }
  };

  // --- VIEW RECEIPT ---
  const handleViewReceipt = async (filePath) => {
    try {
      const { data, error } = await supabase.storage
        .from('payment-proofs') // 👈 This is the bucket we uploaded to in the modal!
        .createSignedUrl(filePath, 60); // Link expires in 60 seconds for security

      if (error) throw error;
      
      setSelectedImage(data.signedUrl);
      setShowImageModal(true);
    } catch (err) {
      addToast({ title: "Load Failed", message: "Could not load receipt image. It may have been deleted.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  };

  // --- APPROVE PAYMENT ---
  const handleApprove = async (record) => {
    if (!(await confirm(`Approve $${record.amount_due} payment for ${record.clients?.full_name}?`))) return;
    
    setProcessingId(record.id);
    setMessage("");

    try {
      // 1. Mark the verification record as Approved
      const { error: updateError } = await supabase
        .from('payment_verifications')
        .update({ status: 'approved', verified_at: new Date().toISOString() })
        .eq('id', record.id);

      if (updateError) throw updateError;

      // 2. GRANT ACCESS BASED ON WHAT THEY BOUGHT
      if (record.service_type === 'account_activation') {
          // The main subscription/portal-access receipt (see IndividualLayout.jsx's
          // lock screen) — this is the one that actually unlocks the portal, since
          // isActivated there reads clients.is_paid directly. Routed through
          // markClientPaid (not a bare `.update({is_paid:true})`) so this also
          // resets bureau statuses, enrolls the client in Document Routing, and
          // fires the paid webhooks — a bare update here was silently skipping
          // Document Routing enrollment, which is exactly why some clients
          // marked paid through this manual-receipt-approval flow never showed
          // up in the Docs Routing queue. `record.clients` only carries
          // full_name/email from the join above, so fetch the full row first —
          // markClientPaid needs admin_id (for the routing assignment) too.
          const { data: freshClient } = await supabase
            .from('clients')
            .select('*')
            .eq('id', record.client_id)
            .maybeSingle();
          const { error: paidErr } = await markClientPaid(record.client_id, freshClient || {}, { triggerSource: "payment_verification_approval", amount: record.amount_due });
          if (paidErr) throw paidErr;

      } else if (record.service_type === 'vault') {
          await supabase
            .from('clients')
            .update({ has_education_vault: true })
            .eq('id', record.client_id);

      } else if (record.service_type === 'processing' || record.service_type === 'bootcamp') {
          await supabase
            .from('clients')
            .update({ status: 'active' }) // Adjust this based on how you track other services!
            .eq('id', record.client_id);
      }

      setMessage(`✅ Payment approved! ${record.clients?.full_name} now has access.`);
      
      // Remove it from the UI list
      setVerifications(prev => prev.filter(v => v.id !== record.id));

    } catch (err) {
      setMessage(`❌ Approval failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  // --- REJECT PAYMENT ---
  const handleReject = async (record) => {
    if (!(await confirm({ message: "Are you sure you want to REJECT this payment? The client will not get access.", variant: "danger", confirmText: "Reject Payment" }))) return;
    
    setProcessingId(record.id);
    try {
      const { error } = await supabase
        .from('payment_verifications')
        .update({ status: 'rejected', verified_at: new Date().toISOString() })
        .eq('id', record.id);

      if (error) throw error;

      setMessage(`⚠️ Payment rejected for ${record.clients?.full_name}.`);
      setVerifications(prev => prev.filter(v => v.id !== record.id));
    } catch (err) {
      setMessage(`❌ Rejection failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) return <div className="text-center p-5"><Spinner animation="border" variant="primary" /></div>;

  return (
    <>
      <Card className="shadow-sm border-0">
        <Card.Header className="bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold">
            <i className="bi bi-shield-check text-primary me-2"></i> 
            Pending Zelle Verifications
          </h5>
          <Badge bg="warning" text="dark" className="px-3 py-2 rounded-pill">
            {verifications.length} Pending
          </Badge>
        </Card.Header>
        
        <Card.Body className="p-0">
          {message && <Alert variant={message.includes("❌") || message.includes("⚠️") ? "danger" : "success"} className="m-3 fw-bold">{message}</Alert>}

          {verifications.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-check-circle fs-1 text-success opacity-50 mb-2 d-block"></i>
              <p className="text-muted mb-0">All caught up! No pending payments.</p>
            </div>
          ) : (
            <Table responsive hover className="mb-0 align-middle">
              <thead className="bg-light">
                <tr>
                  <th className="py-3 ps-4">Client</th>
                  <th className="py-3">Service</th>
                  <th className="py-3">Amount</th>
                  <th className="py-3">Date Submitted</th>
                  <th className="py-3 text-end pe-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {verifications.map((v) => (
                  <tr key={v.id}>
                    <td className="ps-4">
                      <div className="fw-bold text-dark">{v.clients?.full_name || "Unknown"}</div>
                      <div className="text-muted small">{v.clients?.email || "No email"}</div>
                    </td>
                    <td>
                      <Badge bg="info" className="text-uppercase tracking-wider">
                        {v.service_type}
                      </Badge>
                    </td>
                    <td className="fw-bold text-success">${Number(v.amount_due).toFixed(2)}</td>
                    <td className="text-muted small">
                      {new Date(v.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-end pe-4">
                      <div className="d-flex gap-2 justify-content-end">
                        <Button 
                          variant="outline-warning" 
                          size="sm" 
                          className="fw-bold"
                          onClick={() => handleViewReceipt(v.screenshot_url)}
                          disabled={processingId === v.id}
                        >
                          <i className="bi bi-image me-1"></i> Receipt
                        </Button>
                        <Button 
                          variant="success" 
                          size="sm" 
                          className="fw-bold px-3 shadow-sm"
                          onClick={() => handleApprove(v)}
                          disabled={processingId === v.id}
                        >
                          {processingId === v.id ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-check-lg"></i></>}
                        </Button>
                        <Button 
                          variant="danger" 
                          size="sm" 
                          className="fw-bold shadow-sm"
                          onClick={() => handleReject(v)}
                          disabled={processingId === v.id}
                        >
                           <i className="bi bi-x-lg"></i>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

      {/* --- RECEIPT IMAGE MODAL --- */}
      <Modal show={showImageModal} onHide={() => setShowImageModal(false)} centered size="lg">
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold">Zelle Receipt</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center p-4">
          {selectedImage ? (
            <img 
              src={selectedImage} 
              alt="Payment Receipt" 
              className="img-fluid rounded shadow-sm border" 
              style={{ maxHeight: '70vh', objectFit: 'contain' }}
            />
          ) : (
            <Spinner animation="border" />
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}