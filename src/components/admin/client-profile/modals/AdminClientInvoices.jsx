import { useState, useEffect } from "react";
import { supabase } from "../../../../supabaseClient";
import useLogger from "../../../../hooks/useLogger";
import { Card, Badge, Button, Spinner, Alert } from "react-bootstrap";

export default function AdminClientInvoices({ clientId }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [message, setMessage] = useState("");
  const logAction = useLogger();

  const fetchInvoices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setInvoices(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!clientId) return;
    fetchInvoices();

    // Listen for new invoices being generated so the table updates instantly
    const handleRefresh = (e) => {
      if (e.detail?.id === clientId) fetchInvoices();
    };
    window.addEventListener("client-updated", handleRefresh);
    return () => window.removeEventListener("client-updated", handleRefresh);
  }, [clientId]);

  const handleApprovePayment = async (invoice) => {
    if (!window.confirm(`Are you sure you want to mark Invoice ${invoice.invoice_number} as PAID?`)) return;

    setProcessingId(invoice.id);
    setMessage("");

    try {
      // 1. Update Invoice Record
      const { error } = await supabase
        .from("invoices")
        .update({
          payment_status: "Paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (error) throw error;

      // 2. Log the action
      await logAction({
        action: "verify_payment",
        targetId: clientId,
        targetName: "Invoice Management",
        details: `Verified and approved payment for Invoice ${invoice.invoice_number} ($${invoice.grand_total}).`
      });

      setMessage(`✅ Invoice ${invoice.invoice_number} successfully marked as PAID.`);
      
      // 3. Update local state to reflect changes instantly
      setInvoices(prev => prev.map(inv => 
        inv.id === invoice.id ? { ...inv, payment_status: "Paid", paid_at: new Date().toISOString() } : inv
      ));

    } catch (err) {
      setMessage(`❌ Failed to approve payment: ${err.message}`);
    } finally {
      setProcessingId(null);
      setTimeout(() => setMessage(""), 4000);
    }
  };

  if (loading) return <div className="placeholder-glow"><p className="placeholder col-12 py-3"></p></div>;

  return (
    <Card className="shadow-sm h-100 border-0 mb-4">
      <Card.Header className="bg-white border-bottom py-3">
        <h5 className="mb-0 fw-bold">
          <i className="bi bi-receipt text-primary me-2"></i>
          Client Invoices & Billing
        </h5>
      </Card.Header>
      
      <Card.Body className="p-0" style={{ overflowY: "auto", maxHeight: "350px" }}>
        {message && <Alert variant={message.includes("❌") ? "danger" : "success"} className="m-3 py-2 small fw-bold">{message}</Alert>}

        {invoices.length === 0 ? (
          <p className="text-muted small text-center mb-0 py-4">No invoices generated for this client yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light small">
                <tr>
                  <th className="ps-3">Invoice / Tier</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Transaction Info</th>
                  <th className="text-end pe-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className={inv.payment_status === "Pending Verification" ? "table-warning" : ""}>
                    <td className="ps-3">
                      <div className="fw-bold">{inv.invoice_number}</div>
                      <small className="text-muted d-block text-truncate" style={{maxWidth: '180px'}}>{inv.service_tier}</small>
                    </td>
                    <td className="fw-bold text-primary">${Number(inv.grand_total).toFixed(2)}</td>
                    <td>
                      {inv.payment_status === "Paid" && <Badge bg="success">PAID</Badge>}
                      {inv.payment_status === "Pending" && <Badge bg="danger">UNPAID</Badge>}
                      {inv.payment_status === "Pending Verification" && <Badge bg="warning" text="dark">VERIFYING...</Badge>}
                    </td>
                    <td>
                      {inv.transaction_id ? (
                        <>
                          <div className="fw-bold text-dark small">{inv.transaction_id}</div>
                          {inv.transaction_id === "See Uploaded Screenshot" && (
                            <small className="text-danger fw-bold d-block" style={{fontSize: "0.7rem"}}>
                              <i className="bi bi-arrow-down-right"></i> Check Client Uploads below
                            </small>
                          )}
                        </>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td className="text-end pe-3">
                      {inv.payment_status === "Pending Verification" && (
                        <Button 
                          variant="success" 
                          size="sm" 
                          className="fw-bold shadow-sm"
                          onClick={() => handleApprovePayment(inv)}
                          disabled={processingId === inv.id}
                        >
                          {processingId === inv.id ? (
                            <Spinner size="sm" animation="border" />
                          ) : (
                            <><i className="bi bi-check-circle me-1"></i> Approve</>
                          )}
                        </Button>
                      )}
                      
                      {inv.payment_status === "Paid" && (
                        <span className="text-success small fw-bold"><i className="bi bi-check2-all"></i> Verified</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}