import React, { useState, useEffect } from "react";
import { Container, Row, Col, Card, Button, Dropdown, ButtonGroup, Table, Badge, ListGroup, Alert, Spinner, Modal, Tab, Nav, Ratio, Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient";

// 👇 Local Video Assets
import step1 from "../../../assets/videos/step1.mp4";
import step2 from "../../../assets/videos/step2.mp4";

// Components
import Fetch3BModal from "../../admin/client-profile/modals/Fetch3bModal";
import ParseReportModal from "../../admin/client-profile/modals/ParseRreportModal";
import LetterSelectionModal from "./LetterSelectionModal"; 
import InquiriesThread from "../../admin/client-profile/InquiriesThread";
import CreditAuditReport from "../../shared/client-pages/CreditAuditReport"; 
import ConsumerInvoices from "../modals/ConsumerInvoices";
import FunderEligibilityModal from "../../shared/ui/FunderEligibilityModal";
import { useToast } from "../../shared/ui/ToastNotifier";

// 👇 NEW: Import the Quick Eligibility Checker 👇
// (Adjust this path to wherever you saved the file)
import QuickEligibilityChecker from "../../shared/ui/QuickEligibilityChecker"; 

// Import the Onboarding Steps
import ProfileStep1 from "./ProfileStep1";
import ProfileStep2 from "./ProfileStep2";
import ProfileStep3 from "./ProfileStep3";
import ProfileStep4 from "./ProfileStep4";

// Import the hook to access the Smart Engine
import useInquiriesThread from "../../../hooks/useInquiriesThread";

const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx0Ew4N3Cm550587G8u5Mar25IbSxu7W3KydGsbfzQ-lzgK77bidisIhXvQnJMYMJP9/exec";
const LETTER_BUCKET = "client-uploads";
const ASSET_BUCKET = "cover-letter-assets"; 

const maskSSN = (ssn) => ssn ? `***-**-${ssn.slice(-4)}` : "—";
const maskPhone = (phone) => phone ? `***-***-${phone.slice(-4)}` : "—";
const maskDOB = (dob) => dob ? `**/**/****` : "—";
const maskEmail = (email) => {
    if (!email) return "—";
    const [name, domain] = email.split('@');
    return `${name.charAt(0)}***@${domain}`;
};

const educationalVideos = [
  { title: "1. Welcome to the Program", url: step1 },
  { title: "2. Understanding Your Credit Report", url: step2 },
];

const displayScore = (val) => {
    if (!val) return '—';
    return typeof val === 'object' ? (val.score || '—') : val;
};

export default function ProfileDashboard({ client, clientId, auditReport, user, refetchClient, onCreditRefresh, isPreviewMode }) {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState("overview");

  const [show3BModal, setShow3BModal] = useState(false);
  const [showIDIQModal, setShowIDIQModal] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showFunderModal, setShowFunderModal] = useState(false); 
  
  // 👇 NEW: State to show the Quick Checker Modal 👇
  const [showQuickCheckerModal, setShowQuickCheckerModal] = useState(false);

  // Video Modal State
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);

  const [generatingLetter, setGeneratingLetter] = useState(false);
  const [docRefreshKey, setDocRefreshKey] = useState(0); 
  const [requestingHelp, setRequestingHelp] = useState(false);
  const [helpRequested, setHelpRequested] = useState(false);
  
  const [showInfo, setShowInfo] = useState(false);
  
  const [hasDocuments, setHasDocuments] = useState(false);
  const [allInvoicesPaid, setAllInvoicesPaid] = useState(false);

  // Smart Generation States
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [disputeRound, setDisputeRound] = useState(1);
  const [isFastResolution, setIsFastResolution] = useState(false);

  const scores = auditReport?.scores || {};
  const negatives = auditReport?.negatives || [];

  // Initialize the hook to get access to Smart Generation API
  const { generateDisputeLetters, isGenerating: isSmartGenerating } = useInquiriesThread({ 
      clientId, 
      userId: user?.id,
      letterAssets: null // Not needed for generation trigger
  });

  useEffect(() => {
    if (!clientId) return;
    
    // Check if they've seen the welcome video
    const hasSeenWelcome = localStorage.getItem(`hasSeenWelcome_${clientId}`);
    if (!hasSeenWelcome) {
      setShowVideoModal(true); 
      localStorage.setItem(`hasSeenWelcome_${clientId}`, "true"); 
    }

    // Check if they've already requested help in the past
    const hasRequested = localStorage.getItem(`helpRequested_${clientId}`);
    if (hasRequested === "true") {
        setHelpRequested(true);
    }
  }, [clientId]);

  useEffect(() => {
    const checkStepperStatus = async () => {
      if (!clientId) return;
      
      const { count: docCount } = await supabase
        .from('client_documents')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId);
      setHasDocuments(docCount > 0);

      const { data: invoices } = await supabase
        .from('invoices')
        .select('payment_status')
        .eq('client_id', clientId);

      if (invoices && invoices.length > 0) {
        const allPaid = invoices.every(inv => inv.payment_status === 'Paid');
        setAllInvoicesPaid(allPaid);
      } else {
        setAllInvoicesPaid(false);
      }
    };
    checkStepperStatus();
  }, [clientId, activeTab]); 
  
  const handleAssignToAdmin = async () => {
    if(!window.confirm("Are you sure you want to request help from an admin regarding this file?")) return;
    setRequestingHelp(true);
    try {
        const { error } = await supabase.from('notifications').insert({
            type: 'admin_help_request',
            client_id: clientId,
            message: `Client ${client?.full_name || 'Unknown'} (${user?.email}) has requested admin assistance from their dashboard.`,
            status: 'unread',
            created_at: new Date().toISOString()
        });
        if (error) throw error;
        
        try {
            const webhookUrl = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/36c7c9da-355a-46ad-826b-2b378a560212";
            await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: client?.email, fullName: client?.full_name, phone: client?.phone || "", source: "client_dashboard_help_request", clientId: clientId })
            });
        } catch (webhookErr) { console.error("❌ Failed to send admin help webhook:", webhookErr); }
        
        addToast({ title: "Request Sent", message: "An admin has been notified and will review your file shortly.", variant: "success", icon: "bi-check-circle-fill" });

        setHelpRequested(true);
        localStorage.setItem(`helpRequested_${clientId}`, "true");

    } catch (err) {
        console.error("Error requesting help:", err);
        addToast({ title: "Failed to Send Request", message: "Please contact support directly.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setRequestingHelp(false);
    }
  };

  const prepareDisputeCandidates = () => {
      let candidates = [];
      if (auditReport?.accounts) {
          auditReport.accounts.filter(a => a.is_negative).forEach((acc, idx) => {
              candidates.push({ id: `acc-${idx}`, type: 'Account', bureau: acc.bureau, creditor: acc.name, status: acc.status, account_num: acc.account_num, date: acc.opened });
          });
      }
      if (auditReport?.inquiries) {
          auditReport.inquiries.forEach((inq, idx) => {
              candidates.push({ id: `inq-${idx}`, type: 'Inquiry', bureau: inq.bureau || "Unknown", creditor: inq.creditor || inq.name, date: inq.date });
          });
      }
      return candidates;
  };

  // Standard Manual Generation Logic
  const handleGenerateRequest = async (selectedItems) => {
      if (!APP_SCRIPT_URL) { addToast({ title: "Configuration Error", message: "The Letter Generator URL is missing.", variant: "danger", icon: "bi-exclamation-triangle-fill" }); return; }
      
      setShowSelectionModal(false); 
      setGeneratingLetter(true);
      
      try {
          const assetKeys = ["license", "ssn", "poa"];
          const { data: assetFiles } = await supabase.from("client_documents").select("file_name, file_url").eq("client_id", clientId).in("file_name", assetKeys);
          const currentAssets = { licenseUrl: "", ssnUrl: "", poaUrl: "" };
          
          if (assetFiles) {
              for (const file of assetFiles) {
                  let path = file.file_url;
                  if (path.startsWith("http") && path.includes(`/${ASSET_BUCKET}/`)) path = path.split(`/${ASSET_BUCKET}/`)[1];
                  path = path.split("?")[0];
                  const { data: signed } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, 300);
                  if (signed?.signedUrl) {
                      const secureUrl = signed.signedUrl.startsWith("http") ? signed.signedUrl : `https://${signed.signedUrl}`;
                      if (file.file_name === "license") currentAssets.licenseUrl = secureUrl;
                      if (file.file_name === "ssn") currentAssets.ssnUrl = secureUrl;
                      if (file.file_name === "poa") currentAssets.poaUrl = secureUrl;
                  }
              }
          }

          let finalAddress = "Address Not Available";
          if (auditReport?.personal_info) {
              const addrObj = auditReport.personal_info.find(i => i.type === 'ADDRESS');
              if (addrObj && addrObj.value) finalAddress = addrObj.value;
          } 
          if (finalAddress === "Address Not Available") finalAddress = client?.address || "Address Not Available";

          const clientData = { fullName: client?.full_name || "Unknown User", address: finalAddress, dob: client?.dob, ssn: client?.ssn, email: client?.email, phone: client?.phone };
          const bureauGroups = { Experian: [], TransUnion: [], Equifax: [] };

          selectedItems.forEach(item => {
              let key = null;
              const b = (item.bureau || "").toLowerCase();
              if (b.includes("exp") || b === "ex") key = "Experian";
              else if (b.includes("trans") || b.includes("tu")) key = "TransUnion";
              else if (b.includes("equi") || b.includes("eq")) key = "Equifax";
              if (key) bureauGroups[key].push({ creditor: item.creditor, date: item.date || "Unknown Date", account_num: item.account_num || "" });
          });

          let lettersCreated = 0;
          let errorMessages = [];

          for (const bureau of Object.keys(bureauGroups)) {
              const items = bureauGroups[bureau];
              if (items.length === 0) continue; 
              const payload = { client: clientData, bureau: bureau, assets: currentAssets, inquiries: items, timestamp: new Date().toISOString() };
              try {
                  const res = await fetch(APP_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
                  const data = await res.json();
                  if (data.status === "success") {
                        const uniqueId = Math.random().toString(36).substr(2, 5);
                        const fileName = `Dispute_${bureau}_${Date.now()}_${uniqueId}.pdf`;
                        if (data.pdfBase64) {
                            const byteCharacters = atob(data.pdfBase64);
                            const byteNumbers = new Array(byteCharacters.length);
                            for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
                            const byteArray = new Uint8Array(byteNumbers);
                            const blob = new Blob([byteArray], { type: "application/pdf" });
                            const filePath = `${clientId}/${fileName}`;
                            
                            const { error: uploadErr } = await supabase.storage.from(LETTER_BUCKET).upload(filePath, blob, { contentType: "application/pdf" });
                            
                            if (!uploadErr) {
                                await supabase.from("client_documents").insert({ client_id: clientId, file_name: fileName, file_url: filePath, uploaded_by: "System Generated" });
                                await supabase.from("client_portal_documents").insert({ client_id: clientId, file_name: fileName, file_url: filePath, uploaded_by: "System Generated" });
                                lettersCreated++;
                            } else errorMessages.push(`${bureau}: Upload failed (${uploadErr.message})`);
                        } else if (data.url) {
                            await supabase.from("client_documents").insert({ client_id: clientId, file_name: `${bureau} Dispute Letter (Doc)`, file_url: data.url, uploaded_by: "System Generated" });
                            await supabase.from("client_portal_documents").insert({ client_id: clientId, file_name: `${bureau} Dispute Letter (Doc)`, file_url: data.url, uploaded_by: "System Generated" });
                            lettersCreated++;
                        }
                  } else errorMessages.push(`${bureau}: Script error (${data.message})`);
              } catch (reqErr) { errorMessages.push(`${bureau}: Network error`); }
          }

          if (lettersCreated > 0) {
              addToast({ title: "Letters Generated", message: `Generated ${lettersCreated} dispute letter(s). Check "Your Files" below.`, variant: "success", icon: "bi-file-earmark-check-fill" });
              setDocRefreshKey(prev => prev + 1);
          } else {
              const detail = errorMessages.length > 0 ? ` ${errorMessages.join(" / ")}` : "";
              addToast({ title: "No Letters Generated", message: detail || "Please try again.", variant: "warning", icon: "bi-exclamation-circle-fill" });
          }
      } catch (err) {
          console.error("Generation Error:", err);
          addToast({ title: "Generation Failed", message: "An unexpected error occurred. Check console for details.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
      } finally {
          setGeneratingLetter(false);
      }
  };

  const handleConfirmSmartGeneration = async () => {
      setShowGenerateModal(false);
      await generateDisputeLetters(parseInt(disputeRound), isFastResolution);
      setDocRefreshKey(prev => prev + 1); // Refresh docs tab to show newly generated letters
  };

  const journeySteps = [
    { id: 'details', label: 'Details', isDone: !!(client?.ssn && client?.dob), icon: 'bi-person-vcard' },
    { id: 'documents', label: 'Documents', isDone: hasDocuments, icon: 'bi-file-earmark-person' },
    { id: 'credit', label: 'Credit Sync', isDone: !!auditReport, icon: 'bi-cloud-arrow-down' },
    { id: 'agreement', label: 'Agreement', isDone: !!client?.agreement_signed, icon: 'bi-pen' }, 
    { id: 'billing', label: 'Active', isDone: allInvoicesPaid, icon: 'bi-check-circle' }
  ];

  const handleNextVideo = () => {
    if (currentVideoIndex < educationalVideos.length - 1) {
      setCurrentVideoIndex(prev => prev + 1);
    }
  };

  const handlePrevVideo = () => {
    if (currentVideoIndex > 0) {
      setCurrentVideoIndex(prev => prev - 1);
    }
  };

  return (
    <Container fluid="xl" className="my-4">
      
      {/* Header Section */}
      <div className="mb-4">
        <h2 className="fw-bold mb-1">Welcome, {client?.full_name || "Loading..."}</h2>
        <div className="d-flex align-items-center gap-2 mb-3">
            <span className="text-muted">Status: {allInvoicesPaid ? "Active" : "Pending"}</span>
            {allInvoicesPaid && <Badge bg="success">Ready to Dispute</Badge>}
        </div>
        
        <div className="d-flex flex-column flex-md-row flex-wrap align-items-stretch align-items-md-center gap-2">
          <Button variant="warning" onClick={() => setShowAuditModal(true)} disabled={isPreviewMode} className="shadow-sm fw-bold py-2 w-100" style={{ maxWidth: '180px' }}>
             <i className="bi bi-file-earmark-bar-graph me-2"></i> Audit Report
          </Button>

          <Button variant="info" onClick={() => setShowVideoModal(true)} className="shadow-sm fw-bold py-2 text-white w-100" style={{ maxWidth: '180px' }}>
             <i className="bi bi-play-circle-fill me-2"></i> Tutorials
          </Button>

          <Dropdown as={ButtonGroup} className="shadow-sm w-100" style={{ maxWidth: '210px' }}>
            <Button 
                variant="success" 
                onClick={() => setShowSelectionModal(true)} 
                disabled={isPreviewMode || generatingLetter || isSmartGenerating} 
                className="fw-bold py-2"
            >
                {(generatingLetter || isSmartGenerating) ? (
                    <Spinner as="span" animation="border" size="sm" className="me-2" />
                ) : (
                    <i className="bi bi-magic me-2"></i>
                )} 
                Standard Letters
            </Button>
            <Dropdown.Toggle 
                split 
                variant="success" 
                disabled={isPreviewMode || generatingLetter || isSmartGenerating} 
            />
            <Dropdown.Menu align="end">
              <Dropdown.Item onClick={() => setShowGenerateModal(true)}>
                <i className="bi bi-cpu text-primary me-2"></i> Smart Generation Engine...
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>

          {/* 👇 FIX: Bound the button to setShowQuickCheckerModal 👇 */}
          <Button variant="dark" onClick={() => setShowQuickCheckerModal(true)} disabled={isPreviewMode} className="shadow-sm fw-bold py-2 text-warning w-100" style={{ maxWidth: '150px' }}>
             <i className="bi bi-bank me-2"></i> Eligibility
          </Button>

          <Dropdown as={ButtonGroup} className="shadow-sm w-100" style={{ maxWidth: '180px' }}>
            <Button variant="primary" disabled={isPreviewMode} onClick={() => setShow3BModal(true)} className="fw-bold py-2 border-end border-light border-opacity-25 w-100">
                <i className="bi bi-cloud-download me-2"></i> Import
            </Button>
            <Dropdown.Toggle split variant="primary" disabled={isPreviewMode} className="px-2" />
            <Dropdown.Menu align="end">
              <Dropdown.Item onClick={() => setShow3BModal(true)}>SmartCredit</Dropdown.Item>
              <Dropdown.Item onClick={() => setShowIDIQModal(true)}>IdentityIQ</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>

        {!isPreviewMode && (
            <Card className="mt-4 border-0 shadow-sm overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '12px' }}>
                <Card.Body className="d-flex flex-column flex-md-row justify-content-between align-items-center gap-3 p-4">
                    <div className="text-center text-md-start">
                        <h5 className="fw-bold mb-1 text-white">
                          <i className="bi bi-cash-stack me-2 text-success"></i> 
                          Need help paying for your services?
                        </h5>
                        <p className="mb-0 text-light opacity-75">
                          Get prequalified for a loan or set up Flex Pay to easily manage your payments.
                        </p>
                    </div>
                    <div className="d-flex flex-column flex-sm-row gap-2 w-100 w-md-auto mt-2 mt-md-0">
                        <Button variant="success" className="fw-bold shadow-lg px-4 w-100" onClick={() => addToast({ title: "Coming Soon", message: "Prequalification link coming soon!", variant: "info", icon: "bi-hourglass-split" })}>
                          <i className="bi bi-check2-square me-2"></i> Prequalify Now
                        </Button>
                        <Button variant="outline-light" className="fw-bold shadow-sm px-4 w-100" onClick={() => addToast({ title: "Coming Soon", message: "Flex Pay link coming soon!", variant: "info", icon: "bi-hourglass-split" })}>
                          <i className="bi bi-credit-card-2-front me-2 text-warning"></i> Flex Pay
                        </Button>
                    </div>
                </Card.Body>
            </Card>
        )}
      </div>

      {!isPreviewMode && (
          <Card className="border-0 shadow-sm mb-4 py-4 px-3 bg-white" style={{ borderRadius: '12px' }}>
            <div className="overflow-auto hide-scrollbar">
                <div className="d-flex justify-content-between position-relative px-2" style={{ minWidth: '600px' }}>
                  
                  <div 
                    className="position-absolute top-50 start-0 w-100 bg-secondary bg-opacity-25" 
                    style={{ height: '4px', transform: 'translateY(-50%)', zIndex: 0 }}
                  ></div>
                  
                  {journeySteps.map((step, index) => {
                     const isActive = activeTab === step.id;
                     const isDone = step.isDone;

                     let bubbleClass = "bg-secondary text-white"; 
                     if (isDone) bubbleClass = "bg-success text-white shadow"; 
                     else if (isActive) bubbleClass = "bg-primary text-white shadow ring-pulse"; 

                     return (
                      <div 
                        key={step.id} 
                        className="d-flex flex-column align-items-center position-relative" 
                        style={{ zIndex: 1, width: '80px', cursor: 'pointer' }}
                        onClick={() => setActiveTab(step.id)}
                      >
                        <div 
                          className={`rounded-circle d-flex justify-content-center align-items-center ${bubbleClass}`} 
                          style={{ width: '45px', height: '45px', border: '4px solid white', transition: 'all 0.3s ease' }}
                        >
                          {isDone ? <i className="bi bi-check-lg fs-4"></i> : <i className={`bi ${step.icon} fs-5`}></i>}
                        </div>
                        <span className={`small fw-bold mt-2 text-center ${isDone || isActive ? 'text-dark' : 'text-muted'}`}>
                          {step.label}
                        </span>
                      </div>
                     )
                  })}
                </div>
            </div>
          </Card>
      )}

      {/* --- INNER DASHBOARD TABS --- */}
      <Tab.Container activeKey={activeTab} onSelect={(k) => setActiveTab(k)}>
        {!isPreviewMode && (
            <div className="overflow-auto hide-scrollbar mb-4 bg-white p-2 rounded shadow-sm">
                <Nav variant="pills" className="d-flex gap-2 flex-nowrap" style={{ minWidth: 'max-content' }}>
                  <Nav.Item><Nav.Link eventKey="overview" className="text-nowrap fw-bold rounded-pill px-4"><i className="bi bi-grid-fill me-2"></i>Overview</Nav.Link></Nav.Item>
                  <Nav.Item><Nav.Link eventKey="details" className="text-nowrap fw-bold rounded-pill px-4"><i className="bi bi-person-vcard me-2"></i>My Details</Nav.Link></Nav.Item>
                  <Nav.Item><Nav.Link eventKey="documents" className="text-nowrap fw-bold rounded-pill px-4"><i className="bi bi-file-earmark-person me-2"></i>Documents</Nav.Link></Nav.Item>
                  <Nav.Item><Nav.Link eventKey="credit" className="text-nowrap fw-bold rounded-pill px-4"><i className="bi bi-cloud-arrow-down me-2"></i>Credit Sync</Nav.Link></Nav.Item>
                  <Nav.Item><Nav.Link eventKey="agreement" className="text-nowrap fw-bold rounded-pill px-4"><i className="bi bi-pen me-2"></i>Agreement</Nav.Link></Nav.Item>
                  <Nav.Item><Nav.Link eventKey="billing" className="text-nowrap fw-bold rounded-pill px-4"><i className="bi bi-receipt me-2"></i>Billing</Nav.Link></Nav.Item>
                </Nav>
            </div>
        )}

        <Tab.Content>
          <Tab.Pane eventKey="overview">
            <Row>
              <Col lg={8}>
                <Card className="mb-4 border-0 shadow-sm">
                    <Card.Body className="p-4">
                        <h5 className="fw-bold mb-3">Credit Scores</h5>
                        <Row className="text-center g-3">
                            <Col xs={12} sm={4} className="border-bottom border-sm-0 pb-2 pb-sm-0">
                                <div className="text-muted small fw-bold">EXPERIAN</div>
                                <div className="display-6 fw-bold text-primary">{displayScore(scores.EX)}</div>
                            </Col>
                            <Col xs={12} sm={4} className="border-bottom border-sm-0 pb-2 pb-sm-0">
                                <div className="text-muted small fw-bold">TRANSUNION</div>
                                <div className="display-6 fw-bold text-info">{displayScore(scores.TU)}</div>
                            </Col>
                            <Col xs={12} sm={4}>
                                <div className="text-muted small fw-bold">EQUIFAX</div>
                                <div className="display-6 fw-bold text-warning">{displayScore(scores.EQ)}</div>
                            </Col>
                        </Row>
                    </Card.Body>
                </Card>

                <div className="position-relative">
                    <div style={{ filter: isPreviewMode ? 'blur(6px)' : 'none', opacity: isPreviewMode ? 0.6 : 1, pointerEvents: isPreviewMode ? 'none' : 'auto', userSelect: isPreviewMode ? 'none' : 'auto' }}>
                        <Card className="mb-4 border-0 shadow-sm">
                          <Card.Header className="bg-white fw-bold py-3 text-danger">Actionable Items</Card.Header>
                          <Card.Body className="p-0">
                              {negatives.length === 0 ? <div className="p-4 text-center">No negatives found!</div> : 
                              <>
                                <Table responsive hover className="mb-0 align-middle">
                                    <thead className="bg-light">
                                      <tr>
                                        <th>Account</th>
                                        <th>Issue</th>
                                        <th>Bureau</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                        {negatives.slice(0, 5).map((n, i) => (
                                            <tr key={i}>
                                              <td>
                                                <div className="fw-bold">{n.name || n.account}</div>
                                                {(n.account_num || n.account_number) ? (
                                                  <div className="text-muted small fw-normal font-monospace mt-1">
                                                    #{n.account_num || n.account_number}
                                                  </div>
                                                ) : (n.category === 'INQUIRY' || n.issue === 'INQUIRY' || n.type === 'INQUIRY') ? (
                                                  <div className="text-muted small fw-normal font-monospace mt-1 opacity-50">
                                                    No Acct # (Inquiry)
                                                  </div>
                                                ) : null}
                                              </td>
                                              <td><Badge bg="danger">{n.category || n.issue}</Badge></td>
                                              <td className="fw-medium">{n.bureau}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                                
                                {negatives.length > 5 && (
                                    <div className="p-3 text-center bg-light border-top">
                                        <small className="text-muted fw-bold">
                                            + {negatives.length - 5} more items. 
                                            <span className="text-primary ms-1 d-block d-sm-inline mt-2 mt-sm-0" style={{cursor: 'pointer', textDecoration: 'underline'}} onClick={() => setShowAuditModal(true)}>
                                                View Full Report
                                            </span>
                                        </small>
                                    </div>
                                )}
                              </>
                              }
                          </Card.Body>
                        </Card>
                    </div>
                    {isPreviewMode && (
                        <div className="position-absolute top-50 start-50 translate-middle text-center w-100 z-3 px-3">
                            <div className="bg-dark bg-opacity-75 rounded-circle d-inline-flex justify-content-center align-items-center mb-2 shadow" style={{ width: '80px', height: '80px' }}>
                                <i className="bi bi-lock-fill text-warning" style={{ fontSize: '2.5rem' }}></i>
                            </div>
                            <h4 className="fw-bold text-dark text-shadow-sm bg-white bg-opacity-75 p-2 rounded d-inline-block">Dispute Data Locked</h4>
                        </div>
                    )}
                </div>
              </Col>

              <Col lg={4}>
                <div className="position-relative">
                    <div style={{ filter: isPreviewMode ? 'blur(6px)' : 'none', opacity: isPreviewMode ? 0.6 : 1, pointerEvents: isPreviewMode ? 'none' : 'auto', userSelect: isPreviewMode ? 'none' : 'auto' }}>
                        <Card className="border-0 shadow-sm mb-4">
                            <Card.Header className="bg-white fw-bold py-3 d-flex justify-content-between align-items-center">
                                <span>Your Details</span>
                                <div>
                                    <Button variant="link" size="sm" className="text-muted text-decoration-none p-0 me-3" onClick={() => setShowInfo(!showInfo)}>
                                      <i className={`bi ${showInfo ? 'bi-eye-slash' : 'bi-eye'} me-1`}></i>{showInfo ? 'Hide' : 'Show'}
                                    </Button>
                                    <Button variant="outline-secondary" size="sm" onClick={() => setActiveTab('details')}>
                                      <i className="bi bi-pencil me-1"></i> Edit
                                    </Button>
                                </div>
                            </Card.Header>
                            <ListGroup variant="flush">
                                <ListGroup.Item><strong>Name:</strong> {client?.full_name || "—"}</ListGroup.Item>
                                <ListGroup.Item><strong>Email:</strong> <span className="text-break">{showInfo ? (client?.email || "—") : maskEmail(client?.email)}</span></ListGroup.Item>
                                <ListGroup.Item><strong>Phone:</strong> {showInfo ? (client?.phone || "—") : maskPhone(client?.phone)}</ListGroup.Item>
                                <ListGroup.Item><strong>DOB:</strong> {showInfo ? (client?.dob || "—") : maskDOB(client?.dob)}</ListGroup.Item>
                                <ListGroup.Item><strong>SSN:</strong> {showInfo ? (client?.ssn || "—") : maskSSN(client?.ssn)}</ListGroup.Item>
                                <ListGroup.Item><strong>Address:</strong> {client?.address || "—"}</ListGroup.Item>
                            </ListGroup>
                        </Card>
                        
                        <div className="d-grid gap-3 mb-4">
                            <Button variant="outline-primary" size="lg" className="shadow-sm w-100" onClick={() => setActiveTab('documents')}>
                              <i className="bi bi-folder2-open me-2"></i> Manage Documents
                            </Button>
                            <Button 
                                variant={helpRequested ? "outline-success" : "danger"} 
                                size="lg" 
                                className="shadow-sm fw-bold w-100" 
                                onClick={handleAssignToAdmin} 
                                disabled={requestingHelp || helpRequested}
                            >
                              {requestingHelp ? (
                                  <Spinner as="span" animation="border" size="sm" className="me-2"/>
                              ) : (
                                  <i className={`bi ${helpRequested ? 'bi-check-circle-fill text-success' : 'bi-exclamation-octagon'} me-2`}></i>
                              )}
                              {helpRequested ? "Admin Notified" : "Request Admin Help"}
                            </Button>
                        </div>
                    </div>
                    {isPreviewMode && (
                        <div className="position-absolute top-50 start-50 translate-middle text-center w-100 z-3 px-3">
                            <div className="bg-dark bg-opacity-75 rounded-circle d-inline-flex justify-content-center align-items-center mb-2 shadow" style={{ width: '80px', height: '80px' }}>
                                <i className="bi bi-shield-lock-fill text-warning" style={{ fontSize: '2.5rem' }}></i>
                            </div>
                        </div>
                    )}
                </div>
              </Col>
            </Row>

            <Row>
              <Col>
                <div className="position-relative mt-2">
                    <div style={{ filter: isPreviewMode ? 'blur(6px)' : 'none', opacity: isPreviewMode ? 0.6 : 1, pointerEvents: isPreviewMode ? 'none' : 'auto', userSelect: isPreviewMode ? 'none' : 'auto' }}>
                        <InquiriesThread clientId={clientId} readonly={false} refreshKey={docRefreshKey}/>
                    </div>
                </div>
              </Col>
            </Row>
          </Tab.Pane>

          <Tab.Pane eventKey="details">
            <ProfileStep1 clientId={clientId} client={client} onSave={refetchClient} />
          </Tab.Pane>

          <Tab.Pane eventKey="documents">
             <ProfileStep2 clientId={clientId} />
          </Tab.Pane>

          <Tab.Pane eventKey="credit">
             <ProfileStep3 clientId={clientId} onComplete={onCreditRefresh} />
          </Tab.Pane>

          <Tab.Pane eventKey="agreement">
             <ProfileStep4 clientId={clientId} client={client} onComplete={refetchClient} />
          </Tab.Pane>

          <Tab.Pane eventKey="billing">
             <>
                 <ConsumerInvoices clientId={clientId} />
             </>
          </Tab.Pane>

        </Tab.Content>
      </Tab.Container>

      {/* --- ALL MODALS --- */}

      <Modal show={showGenerateModal} onHide={() => setShowGenerateModal(false)} centered>
          <Modal.Header closeButton className="bg-light">
              <Modal.Title className="fw-bold text-dark">
                  <i className="bi bi-cpu me-2 text-primary"></i> Smart Generation Engine
              </Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-white">
              <p className="text-muted small mb-4">
                  The system will automatically assign Metro 2 and Factual dispute reasons based on the options you select below.
              </p>
              <Form.Group className="mb-4">
                  <Form.Label className="fw-bold text-dark">Dispute Round</Form.Label>
                  <Form.Select value={disputeRound} onChange={(e) => setDisputeRound(e.target.value)} className="shadow-sm">
                      <option value={1}>Round 1 (Initial factual disputes)</option>
                      <option value={2}>Round 2 (Metro 2 / Validation demands)</option>
                      <option value={3}>Round 3 (FCRA Escalation)</option>
                  </Form.Select>
              </Form.Group>
              <Form.Group className="mb-2">
                  <Form.Check 
                      type="switch"
                      id="fast-res-switch-dashboard"
                      label={<span className="fw-bold text-dark">I Want Fast Resolution</span>}
                      checked={isFastResolution}
                      onChange={(e) => setIsFastResolution(e.target.checked)}
                  />
              </Form.Group>
          </Modal.Body>
          <Modal.Footer className="bg-light border-0">
              <Button variant="outline-secondary" className="fw-bold" onClick={() => setShowGenerateModal(false)}>Cancel</Button>
              <Button variant="primary" className="fw-bold shadow-sm px-4" onClick={handleConfirmSmartGeneration}>
                  Start Generation <i className="bi bi-arrow-right ms-2"></i>
              </Button>
          </Modal.Footer>
      </Modal>

      <Modal 
        show={showVideoModal} 
        onHide={() => setShowVideoModal(false)} 
        size="lg" 
        centered
      >
        <Modal.Header closeButton className="bg-light">
          <Modal.Title className="fw-bold">
            <i className="bi bi-play-btn-fill text-primary me-2"></i> 
            {educationalVideos[currentVideoIndex].title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark p-0 d-flex justify-content-center align-items-center">
          <Ratio aspectRatio="16x9">
            <video
              src={educationalVideos[currentVideoIndex].url}
              controls
              autoPlay
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            >
              Your browser does not support the video tag.
            </video>
          </Ratio>
        </Modal.Body>
        <Modal.Footer className="d-flex justify-content-between bg-light">
          <Button 
            variant="outline-secondary" 
            onClick={handlePrevVideo} 
            disabled={currentVideoIndex === 0}
            className="fw-bold px-4"
          >
            <i className="bi bi-chevron-left me-1"></i> Previous
          </Button>
          
          <div className="text-muted small fw-bold d-none d-sm-block">
             Video {currentVideoIndex + 1} of {educationalVideos.length}
          </div>
          
          <Button 
            variant="primary" 
            onClick={handleNextVideo} 
            disabled={currentVideoIndex === educationalVideos.length - 1}
            className="fw-bold px-4"
          >
            Next <i className="bi bi-chevron-right ms-1"></i>
          </Button>
        </Modal.Footer>
      </Modal>

      {/* 👇 NEW: Quick Eligibility Checker Modal 👇 */}
      <Modal 
          show={showQuickCheckerModal} 
          onHide={() => setShowQuickCheckerModal(false)} 
          centered 
          size="lg"
          contentClassName="bg-transparent border-0"
      >
          <QuickEligibilityChecker />
      </Modal>

      <LetterSelectionModal show={showSelectionModal} onHide={() => setShowSelectionModal(false)} candidates={prepareDisputeCandidates()} onGenerate={handleGenerateRequest} />
      {show3BModal && <Fetch3BModal clientId={clientId} onClose={() => { setShow3BModal(false); onCreditRefresh && onCreditRefresh(); }} />}
      {showIDIQModal && <ParseReportModal clientId={clientId} show={showIDIQModal} onClose={() => setShowIDIQModal(false)} />}
      
      <FunderEligibilityModal 
        show={showFunderModal} 
        onHide={() => setShowFunderModal(false)} 
        client={{ id: clientId }} 
      />
      <Modal show={showAuditModal} onHide={() => setShowAuditModal(false)} size="xl" fullscreen="lg-down" scrollable>
        <Modal.Header closeButton className="bg-light">
          <Modal.Title className="fw-bold"><i className="bi bi-file-earmark-bar-graph me-2 text-primary"></i> Credit Audit Report</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-light p-0">
            {auditReport ? (<div className="p-3 p-md-4"><CreditAuditReport data={auditReport} /></div>) : (
                <div className="text-center py-5 text-muted px-3">
                    <i className="bi bi-file-earmark-x display-1 opacity-25 mb-3"></i>
                    <h4>No Audit Data Found</h4>
                    <p>Please import a report to generate this audit.</p>
                </div>
            )}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setShowAuditModal(false)} className="w-100 w-sm-auto">Close</Button></Modal.Footer>
      </Modal>

    </Container>
  );
}