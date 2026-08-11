import React, { useState, useRef, useEffect } from "react";
import { Container, Card, Button, Form, Spinner, Alert } from "react-bootstrap";
import SignatureCanvas from 'react-signature-canvas';
import { supabase } from "../../../supabaseClient";
import { jsPDF } from "jspdf";

export default function ProfileStep4({ clientId, client, onComplete, onBack }) {
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePayment, setAgreePayment] = useState(false);
  const [agreeProcessing, setAgreeProcessing] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  
  // 👇 NEW: State to hold the signed document URL if they already signed
  const [signedDocUrl, setSignedDocUrl] = useState(null);
  const isSigned = client?.agreement_signed === true;

  const sigCanvas = useRef({});
  const canvasContainerRef = useRef(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 150 });

  const allAgreed = agreeTerms && agreePayment && agreeProcessing;
  const clientName = client?.full_name || "User";

  // Fix the 0x0 Canvas Bug inside hidden tabs
  useEffect(() => {
    if (!canvasContainerRef.current || isSigned) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0].contentRect.width > 0) {
        setCanvasDimensions({ width: entries[0].contentRect.width, height: 150 });
      }
    });
    observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, [isSigned]);

  // 👇 NEW: Fetch the Signed PDF if they already signed it
  useEffect(() => {
    if (!isSigned || !clientId) return;

    const fetchSignedDoc = async () => {
      try {
        const { data, error } = await supabase
          .from("client_portal_documents")
          .select("file_url")
          .eq("client_id", clientId)
          .eq("file_name", "Signed User Agreement (PDF)")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (data?.file_url) {
          let path = data.file_url;
          if (path.includes('client-uploads/')) {
            path = path.split('client-uploads/').pop();
          }
          
          const { data: urlData } = await supabase.storage
            .from('client-uploads')
            .createSignedUrl(path, 60);
            
          if (urlData?.signedUrl) setSignedDocUrl(urlData.signedUrl);
        }
      } catch (err) {
        console.warn("Could not fetch previously signed document.", err);
      }
    };

    fetchSignedDoc();
  }, [isSigned, clientId]);

  // --- NATIVE PDF GENERATOR ---
  const generateNativePDF = (signatureDataUrl, ipAddress, userAgent) => {
    const pdf = new jsPDF({ orientation: "p", unit: "in", format: "letter" });
    const margin = 1;
    const maxW = 6.5; // 8.5 width - 2 inch margins
    let y = 1;

    const addText = (text, isBold = false, size = 10, indent = 0) => {
      pdf.setFont("helvetica", isBold ? "bold" : "normal");
      pdf.setFontSize(size);
      
      const lines = pdf.splitTextToSize(text, maxW - indent);
      
      for (let i = 0; i < lines.length; i++) {
        if (y > 10) { 
          pdf.addPage();
          y = 1; 
        }
        pdf.text(lines[i], margin + indent, y);
        y += (size / 72) + 0.05; 
      }
      y += 0.05; 
    };

    // Header
    addText("Hidden Partner Cloud™ User Agreement", true, 16);
    y += 0.2;

    // Agreement Content Array
    const content = [
      { text: `This User Agreement ("Agreement") is entered into on ${new Date().toLocaleDateString()}, by and between Hidden Partner Cloud™ ("Company") and ${clientName} ("User").` },
      { text: "Hidden Partner Cloud™ is a cloud-based administrative processing platform that provides system-generated tools designed to assist users with inquiry processing workflows, documentation organization, and administrative processing support." },
      { text: "By accessing or using the Hidden Partner Cloud™ platform, the User agrees to the terms outlined in this Agreement." },
      
      { text: "1. Contract Period", bold: true, size: 12, mt: 0.2 },
      { text: "This Agreement becomes effective when electronically accepted by the User (“Effective Date”). The initial term of this Agreement is 30 days beginning on the Effective Date. This Agreement shall automatically renew for additional one (1) month recurring terms unless either Party provides written notice of cancellation at least fourteen (14) days prior to the expiration of the current term." },
      { text: "If the User terminates this Agreement or elects to reduce the number of authorized end users (“Users”) during an active term, the User agrees to pay 50% of the fees that would have been paid for the remainder of the term." },
      
      { text: "2. Billing and Payment", bold: true, size: 12, mt: 0.2 },
      { text: "Payments are due monthly in advance or according to terms agreed between the parties in writing. Service will not begin until payment is received. Services may be suspended if payment is not received within the agreed terms after seven (7) days notice via email. If an account remains unpaid for 30 days, access may be removed and the account closed." },
      
      { text: "Refund Policy", bold: true },
      { text: "Unless otherwise stated in writing, all payments for platform access and administrative processing services are non-refundable once the platform has been activated. Platform activation occurs when any of the following occurs:" },
      { text: "• login activity\n• document uploads\n• credit report connections\n• documentation generation\n• administrative processing activity\n• other system activity performed within the platform", indent: 0.3 },
      { text: "Users acknowledge that inactivity after activation does not qualify for a refund." },

      { text: "Service Usage Verification", bold: true, mt: 0.1 },
      { text: "The Hidden Partner Cloud™ platform automatically records system activity associated with each user account including, but not limited to: login timestamps, IP addresses, device and browser information, document uploads, credit report connections, documentation generation, and other platform actions." },
      { text: "These records serve as verification that the User has accessed and utilized the platform. The User acknowledges that system activity logs may be used as confirmation that services have been delivered and that platform access has been provided. System activity records may be used as evidence in the event of billing disputes, payment disputes, or chargeback claims." },

      { text: "3. User Accounts & Data Security", bold: true, size: 12, mt: 0.2 },
      { text: "User accounts are provided to be used by the User or those within the User’s organization. Sharing login credentials outside the authorized organization is strictly prohibited. Due to the sensitive nature of financial and identity-related data, users are responsible for maintaining the security of their login credentials." },
      { text: "All IP addresses are automatically logged for security purposes and may be used as evidence in the event of unauthorized account sharing or exposure of sensitive customer data. Users must ensure employees comply with all applicable state and federal laws related to identity protection and financial information security. If unauthorized access or a breach is suspected, Hidden Partner Cloud™ must be notified immediately." },

      { text: "4. Platform Services and Administrative Processing", bold: true, size: 12, mt: 0.2 },
      { text: "Hidden Partner Cloud™ provides a cloud-based infrastructure platform designed to facilitate administrative processing workflows. The platform includes tools that allow users to organize documentation, generate system documentation, manage inquiry processing workflows, track system activity, manage account records, and facilitate administrative processing activities through the platform." },
      { text: "Hidden Partner Cloud™ provides software infrastructure and administrative processing tools only. Hidden Partner Cloud™ does not represent any credit reporting agency, lender, or financial institution and does not guarantee specific outcomes. By activating an account and using the platform, the User acknowledges that they are requesting the use of administrative processing tools and workflows provided through the Hidden Partner Cloud™ system." },

      { text: "5. Representations and Warranties", bold: true, size: 12, mt: 0.2 },
      { text: "Each Party represents and warrants that it has the authority to enter into this Agreement and that doing so will not violate any other contractual obligations. Each Party agrees to comply with all applicable laws including copyright laws, privacy laws, and communications regulations." },

      { text: "6. Acceptable Use", bold: true, size: 12, mt: 0.2 },
      { text: "The User is solely responsible for any data transmitted through the platform. The User agrees not to use the platform in violation of any law, disrupt the platform or other users, or tamper with Hidden Partner Cloud™ systems or security. If Hidden Partner Cloud™ reasonably believes the platform is being used for illegal or disruptive purposes, services may be suspended immediately." },

      { text: "7. Limitation of Liability", bold: true, size: 12, mt: 0.2 },
      { text: "Under no circumstances will Hidden Partner Cloud™ or anyone involved in administering the services be liable for indirect, incidental, special, or consequential damages resulting from the use or inability to use the platform. In the event of any breach by Hidden Partner Cloud™, liability shall not exceed the total amount paid by the User during the previous three (3) months." },

      { text: "8. Confidential Information", bold: true, size: 12, mt: 0.2 },
      { text: "For purposes of this Agreement, Confidential Information includes customer data, computer programs, algorithms, internal systems, operational processes, and employee or consultant information. Both parties agree to maintain confidentiality of all confidential information during the term of this Agreement and for two (2) years after termination." },

      { text: "9. Customer Responsibility and Data Compliance", bold: true, size: 12, mt: 0.2 },
      { text: "The User is responsible for all communications and data transmitted through the platform. The User represents that all information, documentation, and personal data uploaded to the platform has been lawfully obtained. The User agrees not to upload fraudulent or stolen personal information, unauthorized credit data, or information obtained without consumer consent." },
      { text: "The User agrees to defend, indemnify, and hold harmless Hidden Partner Cloud™, its owners, employees, contractors, and affiliates from any claims, damages, liabilities, or legal costs arising from the User’s submission or misuse of customer data. The User may not resell platform access without written authorization." },

      { text: "10. Software License", bold: true, size: 12, mt: 0.2 },
      { text: "Hidden Partner Cloud™ grants the User a non-exclusive, non-transferable license to use the platform software during the term of this Agreement. The Licensed Material may only be used for internal business purposes. Users may not copy, reproduce, distribute, sublicense, or reverse engineer any portion of the platform software." },

      { text: "11. Customer Data", bold: true, size: 12, mt: 0.2 },
      { text: "All data entered into the platform remains the property of the User. Hidden Partner Cloud™ agrees to maintain confidentiality of user data and will only access data as necessary to operate the platform or provide administrative processing services. Upon termination, Hidden Partner Cloud™ may delete or archive data according to internal retention policies." },

      { text: "12. Service Performance Guarantee & Data Backup", bold: true, size: 12, mt: 0.2 },
      { text: "Hidden Partner Cloud™ maintains a 99.9% hosting availability target. Requests for service credits must be sent to info@hiddenpartnercloud.com. Hidden Partner Cloud™ may provide account data exports in CSV format upon request. A $75 processing fee per backup request may apply." },

      { text: "13. Termination", bold: true, size: 12, mt: 0.2 },
      { text: "If either party fails to perform any material term of this Agreement and such failure continues for seven (7) days after written notice, the non-breaching party may terminate the Agreement. Hidden Partner Cloud™ may suspend or terminate services immediately if the platform is used in violation of this Agreement. Users remain responsible for all charges incurred prior to termination." },

      { text: "14. Copyright & Governing Law", bold: true, size: 12, mt: 0.2 },
      { text: "Hidden Partner Cloud™ maintains copyright ownership over all platform design elements. Replication of the platform is strictly prohibited under United States copyright law. This Agreement shall be governed by the laws of the State of Florida, United States." }
    ];

    content.forEach(item => {
      if (item.mt) y += item.mt;
      addText(item.text, item.bold || false, item.size || 10, item.indent || 0);
    });

    y += 0.3;
    addText("User Acceptance", true, 12);
    addText("[ X ] I have read and agree to the Hidden Partner Cloud™ User Agreement");
    addText("[ X ] I authorize payment for services requested through the platform");
    addText("[ X ] I understand administrative processing begins once the system activates my account");

    if (y > 7.5) { 
      pdf.addPage(); 
      y = 1; 
    }
    
    y += 0.5;
    addText("Electronically Signed By:", true, 12);
    
    // Signature
    pdf.addImage(signatureDataUrl, 'PNG', margin, y, 2.5, 0.8);
    y += 0.9; 
    
    addText(`Name: ${clientName}`);
    addText(`Date: ${new Date().toLocaleString()}`);
    
    // Chargeback Protection Data Stamp
    y += 0.3;
    addText("Digital Signature & Device Verification Log", true, 9);
    addText(`IP Address: ${ipAddress}`, false, 8);
    addText(`Device/Browser: ${userAgent}`, false, 8);
    addText(`Action Timestamp: ${new Date().toISOString()}`, false, 8);

    return pdf.output("blob");
  };

  // Securely fetch the user's public IP address
  const fetchUserIP = async () => {
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      return data.ip;
    } catch (err) {
      console.warn("Could not fetch IP", err);
      return "Unavailable";
    }
  };

  const handleSignAgreement = async () => {
    if (isSigned) {
      onComplete();
      return;
    }

    if (!allAgreed) {
      setError("You must check all the acceptance boxes to agree to the terms.");
      return;
    }
    if (sigCanvas.current.isEmpty()) {
      setError("Please provide your signature in the box.");
      return;
    }

    setSaving(true);
    setError(null);

    const signatureData = sigCanvas.current.getCanvas().toDataURL('image/png');

    try {
      // 1. Fetch the IP and Browser info
      const ipAddress = await fetchUserIP();
      const userAgent = navigator.userAgent;

      // 2. Generate Native PDF
      const pdfBlob = generateNativePDF(signatureData, ipAddress, userAgent);

      // 3. Upload the FULL Native PDF to the client-uploads bucket
      const fileName = `Signed_Agreement_${Date.now()}.pdf`;
      const filePath = `${clientId}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('client-uploads') 
        .upload(filePath, pdfBlob, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // 4. Log it in the client_portal_documents table
      const { error: docError } = await supabase
        .from("client_portal_documents")
        .insert({
          client_id: clientId,
          file_name: "Signed User Agreement (PDF)",
          file_url: filePath,
          uploaded_by: "System (User Agreement)" 
        });

      if (docError) throw docError;

      // 5. Update the client profile status WITH the IP & Browser data
      const { error: dbError } = await supabase
        .from("clients")
        .update({ 
            agreement_signed: true, 
            signature_name: signatureData, 
            agreement_date: new Date().toISOString(),
            ip_address: ipAddress,     
            user_agent: userAgent      
        })
        .eq("id", clientId);

      if (dbError) throw dbError;

      onComplete();
    } catch (err) {
      console.error("PDF Generation Error:", err);
      setError(err.message || "Failed to generate and save the PDF. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const clearSignature = () => {
    if (sigCanvas.current && sigCanvas.current.clear) {
      sigCanvas.current.clear();
    }
  };

  const handleDownload = () => window.print();

  return (
    <Container className="py-4 max-w-3xl printable-area">
      <div className="text-center mb-4">
        <div className="mb-3">
          <div style={{ width: "80px", height: "80px", backgroundColor: "#0D6EFD", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: "2rem", fontWeight: "bold" }}>
              HC
          </div>
        </div>
        <h2 className="fw-bold text-primary">Hidden Partner Cloud</h2>
        <p className="text-muted mb-0">info@hiddenpartnercloud.com | 919-300-5202</p>
      </div>

      <Card className="shadow-sm border-0 mb-4">
        <Card.Header className="bg-white border-bottom py-3 d-flex justify-content-between align-items-center no-print">
          <h5 className="mb-0 fw-bold">Step 4: Sign User Agreement</h5>
          <Button variant="outline-secondary" size="sm" onClick={handleDownload}>
            <i className="bi bi-printer me-2"></i> Print / Download
          </Button>
        </Card.Header>
        
        <Card.Body className="p-4">
          <div className="p-4 bg-light border rounded mb-4 agreement-text text-dark" style={{ maxHeight: "400px", overflowY: "auto", fontSize: "0.9rem" }}>
            <h5 className="text-center fw-bold mb-4">Hidden Partner Cloud™ User Agreement</h5>
            
            <p>This User Agreement (“Agreement”) is entered into on the date it is electronically accepted by the User, by and between <strong>Hidden Partner Cloud™</strong> (“Company”) and <strong>{clientName}</strong> (“User”).</p>
            <p>Hidden Partner Cloud™ is a cloud-based administrative processing platform that provides system-generated tools designed to assist users with inquiry processing workflows, documentation organization, and administrative processing support.</p>
            <p>By accessing or using the Hidden Partner Cloud™ platform, the User agrees to the terms outlined in this Agreement.</p>

            <h6 className="fw-bold mt-4">1. Contract Period</h6>
            <p>This Agreement becomes effective when electronically accepted by the User (“Effective Date”).</p>
            <p>The initial term of this Agreement is 30 days beginning on the Effective Date.</p>
            <p>This Agreement shall automatically renew for additional one (1) month recurring terms unless either Party provides written notice of cancellation at least fourteen (14) days prior to the expiration of the current term.</p>
            <p>If the User terminates this Agreement or elects to reduce the number of authorized end users (“Users”) during an active term, the User agrees to pay 50% of the fees that would have been paid for the remainder of the term.</p>

            <h6 className="fw-bold mt-4">2. Billing and Payment</h6>
            <p>Payments are due monthly in advance or according to terms agreed between the parties in writing.</p>
            <p>Service will not begin until payment is received.</p>
            <p>Services may be suspended if payment is not received within the agreed terms after seven (7) days notice via email.</p>
            <p>If an account remains unpaid for 30 days, access may be removed and the account closed.</p>

            <strong className="d-block mt-3 mb-2">Refund Policy</strong>
            <p>Unless otherwise stated in writing, all payments for platform access and administrative processing services are non-refundable once the platform has been activated.</p>
            <p>Platform activation occurs when any of the following occurs:</p>
            <ul className="mb-3">
              <li>login activity</li>
              <li>document uploads</li>
              <li>credit report connections</li>
              <li>documentation generation</li>
              <li>administrative processing activity</li>
              <li>other system activity performed within the platform</li>
            </ul>
            <p>Users acknowledge that inactivity after activation does not qualify for a refund.</p>

            <strong className="d-block mt-3 mb-2">Service Usage Verification</strong>
            <p>The Hidden Partner Cloud™ platform automatically records system activity associated with each user account including, but not limited to:</p>
            <ul className="mb-3">
              <li>login timestamps</li>
              <li>IP addresses</li>
              <li>device and browser information</li>
              <li>document uploads</li>
              <li>credit report connections</li>
              <li>documentation generation</li>
              <li>other platform actions</li>
            </ul>
            <p>These records serve as verification that the User has accessed and utilized the platform.</p>
            <p>The User acknowledges that system activity logs may be used as confirmation that services have been delivered and that platform access has been provided.</p>
            <p>System activity records may be used as evidence in the event of billing disputes, payment disputes, or chargeback claims.</p>

            <h6 className="fw-bold mt-4">3. User Accounts & Data Security</h6>
            <p>User accounts are provided to be used by the User or those within the User’s organization.</p>
            <p>Sharing login credentials outside the authorized organization is strictly prohibited.</p>
            <p>Due to the sensitive nature of financial and identity-related data, users are responsible for maintaining the security of their login credentials.</p>
            <p>All IP addresses are automatically logged for security purposes and may be used as evidence in the event of unauthorized account sharing or exposure of sensitive customer data.</p>
            <p>Users must ensure employees comply with all applicable state and federal laws related to identity protection and financial information security.</p>
            <p>If unauthorized access or a breach is suspected, Hidden Partner Cloud™ must be notified immediately.</p>

            <h6 className="fw-bold mt-4">4. Platform Services and Administrative Processing</h6>
            <p>Hidden Partner Cloud™ provides a cloud-based infrastructure platform designed to facilitate administrative processing workflows.</p>
            <p>The platform includes tools that allow users to:</p>
            <ul className="mb-3">
              <li>organize documentation</li>
              <li>generate system documentation</li>
              <li>manage inquiry processing workflows</li>
              <li>track system activity</li>
              <li>manage account records</li>
              <li>facilitate administrative processing activities through the platform</li>
            </ul>
            <p>Hidden Partner Cloud™ provides software infrastructure and administrative processing tools only.</p>
            <p>Hidden Partner Cloud™ does not represent any credit reporting agency, lender, or financial institution and does not guarantee specific outcomes.</p>
            <p>By activating an account and using the platform, the User acknowledges that they are requesting the use of administrative processing tools and workflows provided through the Hidden Partner Cloud™ system.</p>

            <h6 className="fw-bold mt-4">5. Representations and Warranties</h6>
            <p>Each Party represents and warrants that it has the authority to enter into this Agreement and that doing so will not violate any other contractual obligations.</p>
            <p>Each Party agrees to comply with all applicable laws including:</p>
            <ul className="mb-3">
              <li>copyright laws</li>
              <li>privacy laws</li>
              <li>communications regulations</li>
            </ul>

            <h6 className="fw-bold mt-4">6. Acceptable Use</h6>
            <p>The User is solely responsible for any data transmitted through the platform.</p>
            <p>The User agrees not to:</p>
            <ul className="mb-3">
              <li>use the platform in violation of any law</li>
              <li>disrupt the platform or other users</li>
              <li>tamper with Hidden Partner Cloud™ systems or security</li>
            </ul>
            <p>If Hidden Partner Cloud™ reasonably believes the platform is being used for illegal or disruptive purposes, services may be suspended immediately.</p>

            <h6 className="fw-bold mt-4">7. Limitation of Liability</h6>
            <p>Under no circumstances will Hidden Partner Cloud™ or anyone involved in administering the services be liable for indirect, incidental, special, or consequential damages resulting from the use or inability to use the platform.</p>
            <p>In the event of any breach by Hidden Partner Cloud™, liability shall not exceed the total amount paid by the User during the previous three (3) months.</p>
            <p>Hidden Partner Cloud™ warrants that the Licensed Material does not knowingly infringe any patent, trademark, or copyright of a third party.</p>

            <h6 className="fw-bold mt-4">8. Confidential Information</h6>
            <p>For purposes of this Agreement, Confidential Information includes:</p>
            <ul className="mb-3">
              <li>customer data</li>
              <li>computer programs</li>
              <li>algorithms</li>
              <li>internal systems</li>
              <li>operational processes</li>
              <li>employee or consultant information</li>
            </ul>
            <p>Both parties agree to maintain confidentiality of all confidential information during the term of this Agreement and for two (2) years after termination.</p>

            <h6 className="fw-bold mt-4">9. Customer Responsibility and Data Compliance</h6>
            <p>The User is responsible for all communications and data transmitted through the platform.</p>
            <p>The User represents that all information, documentation, and personal data uploaded to the platform has been lawfully obtained and that the User has proper authorization to upload and process such information.</p>
            <p>The User agrees not to upload:</p>
            <ul className="mb-3">
              <li>fraudulent or stolen personal information</li>
              <li>unauthorized credit data</li>
              <li>information obtained without consumer consent</li>
            </ul>
            <p>Hidden Partner Cloud™ does not verify ownership or authorization of uploaded data and relies on the User’s representation that such data has been lawfully obtained.</p>
            <p>The User agrees to defend, indemnify, and hold harmless Hidden Partner Cloud™, its owners, employees, contractors, and affiliates from any claims, damages, liabilities, or legal costs arising from the User’s submission or misuse of customer data.</p>
            <p>The User may not resell platform access without written authorization.</p>

            <h6 className="fw-bold mt-4">10. Software License</h6>
            <p>Hidden Partner Cloud™ grants the User a non-exclusive, non-transferable license to use the platform software during the term of this Agreement.</p>
            <p>The Licensed Material may only be used for internal business purposes.</p>
            <p>Users may not copy, reproduce, distribute, sublicense, or reverse engineer any portion of the platform software.</p>
            <p>All software and platform design remain the exclusive property of Hidden Partner Cloud™.</p>

            <h6 className="fw-bold mt-4">11. Customer Data</h6>
            <p>All data entered into the platform remains the property of the User.</p>
            <p>Hidden Partner Cloud™ agrees to maintain confidentiality of user data and will only access data as necessary to operate the platform or provide administrative processing services through the platform.</p>
            <p>Upon termination of this Agreement, Hidden Partner Cloud™ may delete or archive data according to internal retention policies.</p>

            <h6 className="fw-bold mt-4">12. Service Performance Guarantee</h6>
            <p>Hidden Partner Cloud™ maintains a 99.9% hosting availability target.</p>
            <p>Requests for service credits must be sent to: <a href="mailto:info@hiddenpartnercloud.com">info@hiddenpartnercloud.com</a></p>
            <p>Credits will be issued within 30 days of approval.</p>

            <h6 className="fw-bold mt-4">13. Data Backup</h6>
            <p>Hidden Partner Cloud™ may provide account data exports in CSV format upon request.</p>
            <p>A $75 processing fee per backup request may apply.</p>
            <p>Backup copies may be delivered electronically or by physical media if requested.</p>

            <h6 className="fw-bold mt-4">14. Termination</h6>
            <p>If either party fails to perform any material term of this Agreement and such failure continues for seven (7) days after written notice, the non-breaching party may terminate the Agreement.</p>
            <p>Hidden Partner Cloud™ may suspend or terminate services immediately if the platform is used in violation of this Agreement.</p>
            <p>Users remain responsible for all charges incurred prior to termination.</p>

            <h6 className="fw-bold mt-4">15. Copyright</h6>
            <p>Hidden Partner Cloud™ maintains copyright ownership over all platform design elements including:</p>
            <ul className="mb-3">
              <li>software code</li>
              <li>interface design</li>
              <li>images and graphics</li>
              <li>HTML and CSS</li>
              <li>platform architecture</li>
            </ul>
            <p>Replication of the platform is strictly prohibited under United States copyright law.</p>

            <h6 className="fw-bold mt-4 mb-3">16. Governing Law</h6>
            <p>This Agreement shall be governed by the laws of the State of Florida, United States.</p>
          </div>

          {error && <Alert variant="danger" className="no-print">{error}</Alert>}

          {/* 👇 NEW: Conditional rendering based on whether they've already signed 👇 */}
          {isSigned ? (
            <div className="bg-light p-4 border rounded shadow-sm text-center">
              <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '3rem' }}></i>
              <h4 className="fw-bold mt-3 text-dark">Agreement Signed</h4>
              <p className="text-muted mb-4">
                You successfully signed the user agreement on {client?.agreement_date ? new Date(client.agreement_date).toLocaleDateString() : "a previous date"}.
              </p>
              
              {signedDocUrl && (
                <Button variant="outline-primary" onClick={() => window.open(signedDocUrl, '_blank')} className="fw-bold px-4">
                  <i className="bi bi-file-earmark-pdf-fill me-2"></i> View Signed Document
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-white p-4 border rounded shadow-sm">
              <h6 className="fw-bold text-dark mb-3">User Acceptance</h6>
              
              <Form.Group className="mb-2 no-print">
                <Form.Check 
                  type="checkbox" 
                  id="agree-terms" 
                  label="I have read and agree to the Hidden Partner Cloud™ User Agreement" 
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="fw-bold text-secondary"
                />
              </Form.Group>
              <Form.Group className="mb-2 no-print">
                <Form.Check 
                  type="checkbox" 
                  id="agree-payment" 
                  label="I authorize payment for services requested through the platform" 
                  checked={agreePayment}
                  onChange={(e) => setAgreePayment(e.target.checked)}
                  className="fw-bold text-secondary"
                />
              </Form.Group>
              <Form.Group className="mb-4 no-print">
                <Form.Check 
                  type="checkbox" 
                  id="agree-processing" 
                  label="I understand administrative processing begins once the system activates my account" 
                  checked={agreeProcessing}
                  onChange={(e) => setAgreeProcessing(e.target.checked)}
                  className="fw-bold text-secondary"
                />
              </Form.Group>
              
              <Form.Group>
                <Form.Label className="text-muted small fw-bold">Sign Below <span className="text-danger">*</span></Form.Label>
                <div 
                  ref={canvasContainerRef}
                  className="border border-secondary rounded bg-white shadow-sm" 
                  style={{ width: '100%', height: '150px' }}
                >
                  {canvasDimensions.width > 0 && (
                    <SignatureCanvas 
                      ref={sigCanvas}
                      penColor="black"
                      canvasProps={{ 
                        width: canvasDimensions.width, 
                        height: canvasDimensions.height, 
                        className: 'rounded' 
                      }}
                    />
                  )}
                </div>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="text-danger p-0 mt-2 text-decoration-none fw-bold no-print" 
                  onClick={clearSignature}
                >
                  <i className="bi bi-eraser-fill me-1"></i> Clear Signature
                </Button>
              </Form.Group>
            </div>
          )}
        </Card.Body>
        <Card.Footer className="bg-white d-flex justify-content-between py-3 no-print">
          <Button variant="outline-secondary" onClick={onBack} disabled={saving} className="px-4 fw-bold">
            <i className="bi bi-arrow-left me-2"></i> Back
          </Button>
          
          {/* 👇 UPDATED: Changes button function and text based on sign status 👇 */}
          <Button 
            variant="primary" 
            onClick={handleSignAgreement} 
            disabled={saving || (!isSigned && !allAgreed)} 
            className="px-4 fw-bold"
          >
            {saving ? <Spinner size="sm" animation="border" /> : (isSigned ? "Continue" : "Sign & Continue")} <i className="bi bi-arrow-right ms-2"></i>
          </Button>
        </Card.Footer>
      </Card>

    </Container>
  );
}