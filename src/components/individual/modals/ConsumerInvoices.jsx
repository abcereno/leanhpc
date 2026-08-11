import React, { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient";
import { Card, Button, Badge, Alert, Spinner, Modal } from "react-bootstrap";

export default function ConsumerInvoices({ clientId }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [processingId, setProcessingId] = useState(null); 

  // Zelle Modal State
  const [showZelleModal, setShowZelleModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // ⚠️ EDIT THIS TO YOUR ACTUAL ZELLE INFO
  const ZELLE_EMAIL = "info@hiddenpartnercloud.com"; 
  const ZELLE_NAME = "Hidden Partner Cloud";

  useEffect(() => {
    if (!clientId) return;
    
    // Check if they just returned from a successful Stripe checkout
    const query = new URLSearchParams(window.location.search);
    const isSuccess = query.get("success");
    const returnedInvoiceId = query.get("invoice_id");
    const returnedSessionId = query.get("session_id");

    if (isSuccess && returnedInvoiceId && returnedSessionId) {
      handleSuccessfulStripePayment(returnedInvoiceId, returnedSessionId);
    } else if (query.get("canceled")) {
      setMessage("⚠️ Payment was canceled. Your invoice is still pending.");
      window.history.replaceState(null, '', window.location.pathname); 
    }

    fetchInvoices();
  }, [clientId]);

  const fetchInvoices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (!error && data) setInvoices(data);
    setLoading(false);
  };

  // --- 🔵 STRIPE LOGIC (AUTO-UNLOCKS) ---
  const handleSuccessfulStripePayment = async (invoiceId, sessionId) => {
    setMessage("✅ Payment Successful! Verifying transaction...");
    
    // 1. Check WHAT they actually bought
    const { data: invoice, error: fetchError } = await supabase
        .from('invoices')
        .select('service_tier') 
        .eq('id', invoiceId)
        .single();

    if (fetchError || !invoice) {
        setMessage("❌ Error verifying invoice details. Please contact support.");
        return;
    }

    // 2. Mark the Invoice as Paid in the database
    const { error: invoiceUpdateError } = await supabase
      .from('invoices')
      .update({ 
          payment_status: 'Paid', 
          payment_method: 'Stripe',
          transaction_id: sessionId, 
          paid_at: new Date().toISOString()
      })
      .eq('id', invoiceId);

    if (invoiceUpdateError) {
        setMessage("❌ Error updating payment status. Please contact support.");
        return;
    }

    // 3. Conditionally unlock based on what they bought
    const purchasedItem = invoice.service_tier;

    if (purchasedItem === 'App Vault') {
        await supabase.from('clients').update({ vault_unlocked: true }).eq('id', clientId);
        setMessage("✅ Payment Successful! Your App Vault is now unlocked.");
    } else if (purchasedItem === 'Credit Repair' || purchasedItem === 'Inquiry Deletion') {
        await supabase.from('clients').update({ status: 'Active' }).eq('id', clientId);
        setMessage("✅ Payment Successful! Your service has officially started.");
    } else {
        setMessage("✅ Payment Successful!");
    }
    
    fetchInvoices();
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleStripeClick = async (invoice) => {
    setProcessingId(invoice.id);
    setMessage("");

    const amountInCents = Math.round(Number(invoice.grand_total) * 100);

    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: { 
          type: 'invoice', 
          clientId: clientId, 
          invoiceId: invoice.id, 
          invoiceNumber: invoice.invoice_number,
          amount: amountInCents,
          returnUrl: window.location.href 
        }
      });

      // 1. Catch database or function errors
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to reach checkout server.");
      }

      // 2. Safely grab the URL (This prevents the infinite spinner!)
      const redirectUrl = data?.url || data?.checkoutUrl;
      
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        throw new Error("Stripe did not return a valid checkout link.");
      }

    } catch (err) {
      console.error("Stripe Error:", err);
      // Display the error so the user isn't confused
      setMessage(`❌ Checkout failed: ${err.message}`);
      // Instantly shut off the loading spinner!
      setProcessingId(null); 
    }
  };

  // --- 🟣 ZELLE LOGIC (MANUAL VERIFICATION) ---
  const handleZelleClick = (invoice) => {
    setSelectedInvoice(invoice);
    setShowZelleModal(true);
  };

  const handleConfirmZellePayment = async () => {
    if (!selectedInvoice) return;
    setProcessingId(selectedInvoice.id);
    setMessage("");

    // Update invoice to show it's awaiting admin verification
    const { error } = await supabase
      .from("invoices")
      .update({ 
          payment_status: "Verification Pending", 
          payment_method: "Zelle" 
      })
      .eq("id", selectedInvoice.id);

    setProcessingId(null);
    setShowZelleModal(false);

    if (error) {
      setMessage("❌ Error notifying admin. Please contact support.");
    } else {
      setMessage("✅ Payment marked as sent! Our team will verify and activate your services shortly.");
      fetchInvoices();
    }
  };

  if (loading) return <div className="text-center p-4"><Spinner animation="border" variant="primary" /></div>;

  return (
    <>
      <Card className="shadow-sm border-0 mb-4">
        <Card.Header className="bg-white border-bottom py-3">
          <h5 className="mb-0 fw-bold"><i className="bi bi-receipt text-primary me-2"></i> My Invoices</h5>
        </Card.Header>
        <Card.Body className="p-0">
          
          {message && <Alert variant={message.includes("❌") || message.includes("⚠️") ? "danger" : "success"} className="m-3 py-2 small fw-bold">{message}</Alert>}

          {invoices.length === 0 ? (
            <div className="text-center py-5">
              <i className="bi bi-check2-circle fs-1 text-success opacity-50 mb-2 d-block"></i>
              <p className="text-muted mb-0">You have no pending invoices.</p>
            </div>
          ) : (
            <ul className="list-group list-group-flush">
              {invoices.map((inv) => (
                <li key={inv.id} className="list-group-item p-4">
                  <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
                    <div>
                      <h6 className="fw-bold mb-1">{inv.service_tier}</h6>
                      <div className="text-muted small">
                        Invoice #{inv.invoice_number} • {new Date(inv.created_at).toLocaleDateString()}
                      </div>
                      
                      <div className="mt-2">
                        {inv.payment_status === "Paid" && <Badge bg="success" className="px-3 py-2">PAID</Badge>}
                        {inv.payment_status === "Pending" && <Badge bg="danger" className="px-3 py-2">ACTION REQUIRED</Badge>}
                        {inv.payment_status === "Verification Pending" && <Badge bg="warning" text="dark" className="px-3 py-2"><Spinner size="sm" className="me-1"/> VERIFYING PAYMENT</Badge>}
                      </div>
                    </div>
                    
                    <div className="text-end">
                      <h4 className="fw-bold text-primary mb-2">${Number(inv.grand_total).toFixed(2)}</h4>
                      
                      {/* Show both buttons if Pending */}
                      {inv.payment_status === "Pending" && (
                        <div className="d-flex gap-2 justify-content-end">
                          <Button 
                            variant="primary" 
                            className="fw-bold shadow-sm rounded px-3"
                            onClick={() => handleStripeClick(inv)}
                            disabled={processingId === inv.id}
                          >
                            {processingId === inv.id ? (
                                <><Spinner as="span" size="sm" animation="border" className="me-2"/> Loading...</>
                            ) : (
                                <><i className="bi bi-credit-card me-2"></i> Pay with Card</>
                            )}
                          </Button>

                          <Button 
                            variant="light" 
                            className="fw-bold shadow-sm rounded px-3"
                            onClick={() => handleZelleClick(inv)}
                            disabled={processingId === inv.id}
                          >
                            <i className="bi bi-send me-2"></i> Zelle
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card.Body>
      </Card>

      {/* --- ZELLE INSTRUCTIONS MODAL --- */}
      <Modal show={showZelleModal} onHide={() => setShowZelleModal(false)} centered backdrop="static">
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fw-bold text-primary">Zelle Payment</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center pt-2">
          <div className="mb-4">
            <h1 className="display-4 fw-bold text-dark">${selectedInvoice ? Number(selectedInvoice.grand_total).toFixed(2) : "0.00"}</h1>
            <p className="text-muted mb-0">Total Due</p>
          </div>

          <Alert variant="info" className="text-start">
            <p className="mb-2 fw-bold">Please send your Zelle payment to:</p>
            <div className="p-3 bg-white rounded border border-info mb-3">
              <div className="mb-1 text-muted small">Zelle Email / Phone</div>
              <div className="fw-bold fs-5">{ZELLE_EMAIL}</div>
              <div className="text-muted small mt-2">Registered Name: <strong>{ZELLE_NAME}</strong></div>
            </div>
            <p className="mb-0 small text-dark">
              <strong>Note:</strong> Please include your Invoice # (<strong>{selectedInvoice?.invoice_number}</strong>) in the Zelle memo so we can quickly verify your payment.
            </p>
          </Alert>

        </Modal.Body>
        <Modal.Footer className="d-flex flex-column gap-2 border-0 pt-0">
          <Button 
            variant="success" 
            size="lg" 
            className="w-100 fw-bold shadow-sm" 
            onClick={handleConfirmZellePayment}
            disabled={processingId === selectedInvoice?.id}
          >
            {processingId === selectedInvoice?.id ? (
              <><Spinner as="span" size="sm" animation="border" className="me-2"/> Notifying Admin...</>
            ) : (
              "I Have Sent the Payment"
            )}
          </Button>
          <Button variant="link" className="text-muted w-100 text-decoration-none" onClick={() => setShowZelleModal(false)}>
            Cancel, I'll pay later
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}