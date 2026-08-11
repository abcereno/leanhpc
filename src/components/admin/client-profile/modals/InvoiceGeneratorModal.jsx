import React, { useState, useEffect, useRef } from "react";
import { Modal, Button, Form, Row, Col, InputGroup, Alert, Badge } from "react-bootstrap";
import { supabase } from "../../../../supabaseClient";
import useLogger from "../../../../hooks/useLogger";
import { useToast } from "../../../shared/ui/ToastNotifier";
import { jsPDF } from "jspdf";

// 🛑 REPLACE WITH YOUR ACTUAL BUSINESS CASHTAG
const MY_CASHTAG = "$Toyz11"; 

const PRICING_TIERS = {
  "Bulk Processing (3 Bureaus)": 499,
  "Experian Only": 299,
  "TransUnion Only": 199,
  "Equifax Only": 199,
  "Full File Processing": 1500,
  "Full File Processing (3 Payments)": 550, // Per month
  "Full File Processing (6 Payments)": 300, // Per month
};

export default function InvoiceGeneratorModal({ show, onClose, client }) {
  const logAction = useLogger();
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    client_name: "",
    email: "",
    phone: "",
    service_tier: "Bulk Processing (3 Bureaus)",
    total_inquiries: 0,
    payment_status: "Pending",
    payment_method: "",
    transaction_id: "",
  });

  const [overrideActive, setOverrideActive] = useState(false);
  const [manualTotal, setManualTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const prevShowRef = useRef(false);

  // Only re-seed on the actual closed->open transition, not on every render
  // where `show` happens to still be true. The old deps array (`[show,
  // client]`) reset client_name/email/phone on ANY re-render that handed
  // down a new `client` object reference — including a parent re-render
  // triggered by something unrelated (e.g. Supabase refreshing the auth
  // session when the browser tab regains focus), which was silently
  // overwriting whatever the admin had already edited in this invoice form.
  // See AddClientModal.jsx for the same fix applied there.
  useEffect(() => {
    if (show && client && !prevShowRef.current) {
      setFormData((prev) => ({
        ...prev,
        client_name: client.full_name || "",
        email: client.email || "",
        phone: client.phone || "",
      }));
      setSuccessMsg("");
    }
    prevShowRef.current = show;
  }, [show, client]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const basePrice = PRICING_TIERS[formData.service_tier] || 0;
  const isFullFile = formData.service_tier.includes("Full File");
  const extraInquiries = (!isFullFile && formData.total_inquiries > 25) ? formData.total_inquiries - 25 : 0;
  const additionalFee = extraInquiries * 10;
  
  const calculatedTotal = basePrice + additionalFee;
  const grandTotal = overrideActive ? parseFloat(manualTotal || 0) : calculatedTotal;

  // --- PDF GENERATOR HELPER ---
  const generatePDF = (invoiceNum, outputType = "blob") => {
    const pdf = new jsPDF({ orientation: "p", unit: "in", format: "letter" });
    const margin = 1;
    let y = 1;

    // Header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("INVOICE", margin, y);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text("Hidden Partner Cloud™", margin, y + 0.2);

    // Invoice Meta
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("Invoice Number:", 5.5, y);
    pdf.text("Date:", 5.5, y + 0.2);
    
    pdf.setFont("helvetica", "normal");
    pdf.text(invoiceNum || "HPC-DRAFT", 6.7, y);
    pdf.text(new Date().toLocaleDateString(), 6.7, y + 0.2);

    y += 0.8;

    // Billed To
    pdf.setFont("helvetica", "bold");
    pdf.text("BILLED TO:", margin, y);
    y += 0.2;
    pdf.setFont("helvetica", "normal");
    pdf.text(formData.client_name || "Client Name", margin, y);
    pdf.text(formData.email || "Email", margin, y + 0.2);
    pdf.text(formData.phone || "Phone", margin, y + 0.4);

    y += 0.8;

    // Line Items Header
    pdf.setFont("helvetica", "bold");
    pdf.text("DESCRIPTION", margin, y);
    pdf.text("AMOUNT", 6.5, y);
    pdf.line(margin, y + 0.1, 7.5, y + 0.1); 
    y += 0.4;

    // Line Item 1
    pdf.setFont("helvetica", "bold");
    pdf.text("Administrative Inquiry Processing Support", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Tier: ${formData.service_tier}`, margin, y + 0.2);
    pdf.text(`$${basePrice.toFixed(2)}`, 6.5, y);

    y += 0.5;

    // Extras
    if (extraInquiries > 0) {
      pdf.setFont("helvetica", "bold");
      pdf.text("Additional Inquiries", margin, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${extraInquiries} extra x $10.00`, margin, y + 0.2);
      pdf.text(`$${additionalFee.toFixed(2)}`, 6.5, y);
      y += 0.5;
    }

    if (overrideActive) {
      pdf.setTextColor(255, 0, 0);
      pdf.text("* Manual Price Override Applied", margin, y);
      pdf.setTextColor(0, 0, 0);
      y += 0.4;
    }

    // Total
    pdf.line(margin, y, 7.5, y);
    y += 0.3;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("GRAND TOTAL:", 4.5, y);
    pdf.setTextColor(13, 110, 253); 
    pdf.text(`$${grandTotal.toFixed(2)}`, 6.5, y);
    pdf.setTextColor(0, 0, 0);
    
    y += 0.5;
    pdf.setFontSize(12);
    pdf.text(`Status: ${formData.payment_status.toUpperCase()}`, margin, y);

    y += 0.6;

    // ==========================================
    // 💵 NEW: CASH APP CLICKABLE PAYMENT BUTTON
    // ==========================================
    if (formData.payment_status === "Pending") {
      const cashAppUrl = `https://cash.app/${MY_CASHTAG}/${grandTotal.toFixed(2)}`;
      
      // Draw Green Button Background
      pdf.setFillColor(0, 214, 50); // Cash App Green
      pdf.rect(margin, y, 6.5, 0.6, 'F');
      
      // Draw Button Text
      pdf.setTextColor(255, 255, 255); // White Text
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(`CLICK HERE TO PAY $${grandTotal.toFixed(2)} VIA CASH APP`, margin + 1.2, y + 0.38);
      
      // Make the entire green box a clickable link!
      pdf.link(margin, y, 6.5, 0.6, { url: cashAppUrl });

      y += 0.9;

      // ==========================================
      // ⚠️ NEW: PORTAL UPLOAD INSTRUCTIONS
      // ==========================================
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(220, 53, 69); // Bootstrap Danger Red
      pdf.setFontSize(11);
      pdf.text("ACTION REQUIRED AFTER PAYMENT:", margin, y);
      
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text("You must return to the Client Portal to submit your $Cashtag, Receipt Number,", margin, y + 0.2);
      pdf.text("or upload a screenshot of your payment. Your processing will not begin until", margin, y + 0.35);
      pdf.text("payment is verified in the portal.", margin, y + 0.5);

      y += 0.8; // Add space before legal terms
    }

    // Legal Terms
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text("Authorization:", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text("Activation of your Hidden Partner Cloud™ account constitutes access to the platform", margin, y + 0.15);
    pdf.text("and initiation of administrative processing services.", margin, y + 0.3);

    y += 0.6;
    pdf.setFont("helvetica", "bold");
    pdf.text("Terms:", margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text("By submitting payment, the client confirms authorization of the transaction and acceptance", margin, y + 0.15);
    pdf.text("of Hidden Partner Cloud™ Terms and Conditions.", margin, y + 0.3);

    if (outputType === "download") {
      pdf.save(`Invoice_${invoiceNum || "Draft"}.pdf`);
    } else {
      return pdf.output("blob");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: invoiceNum, error: rpcError } = await supabase.rpc('generate_hpc_invoice_number');
      if (rpcError) throw rpcError;

      const payload = {
        client_id: client.id,
        invoice_number: invoiceNum,
        service_tier: formData.service_tier,
        base_price: basePrice,
        total_inquiries: parseInt(formData.total_inquiries || 0),
        additional_fee: additionalFee,
        grand_total: grandTotal,
        payment_status: formData.payment_status,
        payment_method: formData.payment_status === "Paid" ? formData.payment_method : null,
        transaction_id: formData.payment_status === "Paid" ? formData.transaction_id : null,
        paid_at: formData.payment_status === "Paid" ? new Date().toISOString() : null,
      };

      const { error: insertError } = await supabase.from("invoices").insert(payload);
      if (insertError) throw insertError;

      const pdfBlob = generatePDF(invoiceNum, "blob");
      const fileName = `Invoice_${invoiceNum}.pdf`;
      const storagePath = `${client.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('client-uploads') 
        .upload(storagePath, pdfBlob, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      const { error: docError } = await supabase
        .from("client_portal_documents")
        .insert({
          client_id: client.id,
          file_name: `System Generated Invoice (${invoiceNum})`,
          file_url: storagePath,
          uploaded_by: "System (Invoice Generator)" 
        });

      if (docError) throw docError;

      await logAction({
        action: "generate_invoice",
        targetId: client.id,
        targetName: formData.client_name,
        details: `Generated Invoice ${invoiceNum} for $${grandTotal.toFixed(2)} and saved to portal.`,
      });

      setSuccessMsg(`✅ Invoice ${invoiceNum} generated and sent to client portal!`);
      addToast({ title: "Invoice Generated", message: `Invoice ${invoiceNum} sent to the client portal.`, variant: "success", icon: "bi-receipt" });
      setTimeout(() => {
        onClose();
        window.dispatchEvent(new CustomEvent('client-updated', { detail: { id: client.id } }));
      }, 2500);

    } catch (err) {
      console.error(err);
      addToast({ title: "Invoice Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <Modal show={show} onHide={onClose} size="xl" backdrop="static">
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title><i className="bi bi-receipt me-2"></i> HPC Invoice Generator</Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-light">
        {successMsg && <Alert variant="success">{successMsg}</Alert>}
        
        <Row>
          {/* LEFT COLUMN: Controls & Inputs */}
          <Col lg={5} className="border-end pe-4">
            <Form onSubmit={handleSubmit}>
              <h6 className="text-primary fw-bold mb-3 border-bottom pb-2">Client Details</h6>
              <Form.Group className="mb-2">
                <Form.Label className="small fw-bold">Client Name</Form.Label>
                <Form.Control type="text" name="client_name" value={formData.client_name} onChange={handleChange} required />
              </Form.Group>
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Email</Form.Label>
                    <Form.Control type="email" name="email" value={formData.email} onChange={handleChange} required />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Phone</Form.Label>
                    <Form.Control type="text" name="phone" value={formData.phone} onChange={handleChange} />
                  </Form.Group>
                </Col>
              </Row>

              <h6 className="text-primary fw-bold mt-4 mb-3 border-bottom pb-2">Service Details</h6>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">Processing Tier</Form.Label>
                <Form.Select name="service_tier" value={formData.service_tier} onChange={handleChange}>
                  {Object.keys(PRICING_TIERS).map(tier => (
                    <option key={tier} value={tier}>{tier} — ${PRICING_TIERS[tier]}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              {!isFullFile && (
                <Form.Group className="mb-3">
                  <Form.Label className="small fw-bold">Total Inquiries Identified</Form.Label>
                  <InputGroup>
                    <Form.Control 
                      type="number" 
                      min="0" 
                      name="total_inquiries" 
                      value={formData.total_inquiries} 
                      onChange={handleChange} 
                    />
                    <InputGroup.Text className="bg-white text-muted small">
                      (25 Included)
                    </InputGroup.Text>
                  </InputGroup>
                  {extraInquiries > 0 && (
                    <Form.Text className="text-danger fw-bold">
                      + {extraInquiries} extra inquiries at $10/ea = ${additionalFee.toFixed(2)}
                    </Form.Text>
                  )}
                </Form.Group>
              )}

              <Form.Group className="mb-4 bg-white p-3 border rounded">
                <Form.Check 
                  type="switch" 
                  id="override-switch"
                  label={<span className="fw-bold ms-1">Manual Pricing Override</span>}
                  checked={overrideActive}
                  onChange={(e) => setOverrideActive(e.target.checked)}
                />
                {overrideActive && (
                  <InputGroup className="mt-2">
                    <InputGroup.Text>$</InputGroup.Text>
                    <Form.Control 
                      type="number" 
                      step="0.01" 
                      value={manualTotal} 
                      onChange={(e) => setManualTotal(e.target.value)} 
                      placeholder="Enter custom grand total" 
                    />
                  </InputGroup>
                )}
              </Form.Group>

              <h6 className="text-primary fw-bold mt-4 mb-3 border-bottom pb-2">Payment Status</h6>
              <Form.Group className="mb-3">
                <Form.Select name="payment_status" value={formData.payment_status} onChange={handleChange}>
                  <option value="Pending">Pending (Unpaid)</option>
                  <option value="Paid">Paid</option>
                </Form.Select>
              </Form.Group>

              {formData.payment_status === "Paid" && (
                <div className="p-3 bg-white border rounded border-success mb-3">
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Payment Method</Form.Label>
                    <Form.Select name="payment_method" value={formData.payment_method} onChange={handleChange} required>
                      <option value="">-- Select Method --</option>
                      <option value="Stripe">Stripe</option>
                      <option value="Zelle">Zelle</option>
                      <option value="CashApp">CashApp</option>
                      <option value="Venmo">Venmo</option>
                    </Form.Select>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label className="small fw-bold">Transaction ID</Form.Label>
                    <Form.Control type="text" name="transaction_id" value={formData.transaction_id} onChange={handleChange} placeholder="e.g. pi_12345..." required />
                  </Form.Group>
                </div>
              )}

              <Button variant="primary" type="submit" className="w-100 py-2 fw-bold" disabled={loading}>
                {loading ? "Generating & Saving..." : "Save & Generate Invoice"}
              </Button>
            </Form>
          </Col>

          {/* RIGHT COLUMN: Invoice Preview */}
          <Col lg={7} className="p-4 bg-white rounded shadow-sm">
            <div className="d-flex justify-content-between align-items-start mb-4">
              <div>
                <h3 className="fw-bold mb-0" style={{ letterSpacing: "-1px" }}>INVOICE</h3>
                <span className="text-muted small">Hidden Partner Cloud™</span>
              </div>
              <div className="text-end">
                <div className="text-muted small">Invoice Number</div>
                <div className="fw-bold text-primary">HPC-2026-AUTO</div>
                <div className="text-muted small mt-2">Date</div>
                <div className="fw-bold">{new Date().toLocaleDateString()}</div>
              </div>
            </div>

            <div className="mb-4">
              <div className="text-muted small text-uppercase">Billed To</div>
              <div className="fw-bold fs-5">{formData.client_name || "Client Name"}</div>
              <div>{formData.email || "client@email.com"}</div>
              <div>{formData.phone || "(xxx) xxx-xxxx"}</div>
            </div>

            <table className="table mb-4">
              <thead className="table-light">
                <tr>
                  <th>Description</th>
                  <th className="text-end">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="fw-bold d-block">Administrative Inquiry Processing Support</span>
                    <small className="text-muted">{formData.service_tier}</small>
                  </td>
                  <td className="text-end align-middle">${basePrice.toFixed(2)}</td>
                </tr>
                {extraInquiries > 0 && (
                  <tr>
                    <td>
                      <span className="d-block">Additional Inquiries</span>
                      <small className="text-muted">{extraInquiries} extra x $10.00</small>
                    </td>
                    <td className="text-end align-middle">${additionalFee.toFixed(2)}</td>
                  </tr>
                )}
                {overrideActive && (
                  <tr>
                    <td className="text-danger fst-italic">Manual Price Override Applied</td>
                    <td className="text-end text-danger">—</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td className="text-end fw-bold fs-5 border-0 pt-4">Grand Total:</td>
                  <td className="text-end fw-bold fs-4 text-primary border-0 pt-4">${grandTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            {/* PREVIEW: Payment Instructions Box */}
            {formData.payment_status === "Pending" && (
              <div className="mb-4 p-3 border border-success rounded bg-success bg-opacity-10 text-center">
                <div className="fw-bold text-success mb-2">
                  <i className="bi bi-link-45deg me-1"></i> PDF will include a clickable Cash App link!
                </div>
                <div className="small text-danger fw-bold">
                  PDF will also instruct the user to return to the portal to submit their $Cashtag/Screenshot.
                </div>
              </div>
            )}

            <div className="mb-4 d-flex justify-content-between align-items-center p-3 bg-light rounded">
              <span className="fw-bold text-muted">Status:</span>
              <Badge bg={formData.payment_status === "Paid" ? "success" : "warning"} text={formData.payment_status === "Paid" ? "white" : "dark"} className="fs-6 px-3 py-2">
                {formData.payment_status.toUpperCase()}
              </Badge>
            </div>

            {/* Legal / Compliance Text */}
            <div className="border-top pt-3 text-muted" style={{ fontSize: "0.75rem", lineHeight: "1.4" }}>
              <p className="mb-2">
                <strong>Authorization:</strong> Activation of your Hidden Partner Cloud™ account constitutes access to the platform and initiation of administrative processing services.
              </p>
              <p className="mb-0">
                <strong>Terms:</strong> By submitting payment, the client confirms authorization of the transaction and acceptance of Hidden Partner Cloud™ Terms and Conditions. Administrative processing services performed through the Hidden Partner Cloud™ platform include document preparation, system workflow management, and administrative inquiry processing activities.
              </p>
            </div>
            
            {/* Download Button */}
            <div className="text-end mt-4">
              <Button variant="outline-secondary" size="sm" onClick={() => generatePDF(null, "download")}>
                <i className="bi bi-file-earmark-pdf me-2"></i>Download Draft PDF
              </Button>
            </div>
          </Col>
        </Row>
      </Modal.Body>
    </Modal>
  );
}