import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClient } from "../../hooks/useClient";
import { resolveServiceId, serviceLabel } from "../../utils/services";
import { useCompanyAuth } from "../../context/CompanyAuthContext";
import { useToast } from "../shared/ui/ToastNotifier";
import {
  Container,
  Spinner,
  Alert,
  Card,
  Button,
  Row,
  Col,
  ListGroup,
  Badge,
  Dropdown,
  Modal,
} from "react-bootstrap";
import { supabase } from "../../supabaseClient"; 
import CoverLetterAssets from "../admin/client-profile/CoverLetterAssets"; 
import { useClientCreditFiles } from "../../hooks/useClientCreditFiles";
import RequiredDocsChecklist from "./RequiredDocsChecklist";
import InquirySelectionModal from "./InquirySelectionModal"; 
import SignatureCanvas from 'react-signature-canvas'; 

import Fetch3BModal from "../admin/client-profile/modals/Fetch3bModal";
import ParseReportModal from "../admin/client-profile/modals/ParseRreportModal";
import EditContactInfoModal from "./EditContactInfoModal";

const ONBOARDING_BUCKET = "onboarding-documents"; 

// 👇 UPDATED: FormatNotes now detects and renders image links as actual images 👇
const FormatNotes = ({ notes }) => {
  if (!notes) return null;

  const urlRegex = /(https?:\/\/[^\s]+)/g;

  return notes.split('\n').map((line, index) => {
    const parts = line.split(urlRegex);

    return (
      <span key={index} className="d-block mb-1">
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            // Detect if URL is a screenshot from our bucket or ends in an image extension
            const isImage = part.match(/\.(jpeg|jpg|gif|png|webp)/i) || part.includes('screenshot');
            
            if (isImage) {
              return (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="d-inline-block mt-2 mb-2">
                  <img 
                    src={part} 
                    alt="attachment" 
                    className="shadow-sm"
                    style={{ maxHeight: '150px', borderRadius: '6px', border: '1px solid #dee2e6' }} 
                  />
                </a>
              );
            }
            return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="fw-bold">{part}</a>;
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  });
};

export default function ClientProfilePage() {
  const { clientId } = useParams();
  const { companyId, user, isAgent, fullName } = useCompanyAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [docLinks, setDocLinks] = useState({ licenseUrl: undefined, ssnUrl: undefined, poaUrl: undefined });

  // Modal State
  const [activeModal, setActiveModal] = useState(null);
  const [showInquiryModal, setShowInquiryModal] = useState(false);
  const [showEditContact, setShowEditContact] = useState(false);

  // Signature & Locking State
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [stagedInquiries, setStagedInquiries] = useState([]);
  const [isLocking, setIsLocking] = useState(false);

  const sigCanvas = useRef(null);

  const { client, loading, error, refetch } = useClient(clientId);
  const { loading: loadingCredit, error: creditError, normalized } = useClientCreditFiles(clientId);

  useEffect(() => {
    if (!loading && client && isAgent) {
        if (client.agent_id !== user.id) {
            console.warn(`⛔ Unauthorized: Agent ${user.id} tried to view Client ${client.id}`);
            navigate(`/company-portal/${companyId}/dashboard`, { replace: true });
        }
    }
  }, [loading, client, isAgent, user, companyId, navigate]);

  const closeModal = () => setActiveModal(null);
  const handleModalSave = () => {
    closeModal();
    window.location.reload(); 
  };

  const clientBlock = (normalized && normalized.clientBlock) || {};
  const [reqChecks, setReqChecks] = useState({
    idProvided: false, poaProvided: false, ssnProvided: false, monitoringActive: false,
  });

  const handleConfirmInquiries = (selectedInquiries) => {
    setStagedInquiries(selectedInquiries);
    setShowInquiryModal(false);
    setShowSignatureModal(true); 
  };

  const handleSignAndLock = async () => {
    if (sigCanvas.current.isEmpty()) {
      addToast({ title: "Signature Required", message: "Please provide a signature before locking.", variant: "warning", icon: "bi-exclamation-circle-fill" });
      return;
    }

    setIsLocking(true);

    try {
      const dataUrl = sigCanvas.current.getCanvas().toDataURL('image/png');      
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      
      const fileName = `signatures/${clientId}_${Date.now()}.png`;

      const { error: uploadErr } = await supabase.storage
        .from(ONBOARDING_BUCKET)
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: true
        });

      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage
        .from(ONBOARDING_BUCKET)
        .getPublicUrl(fileName);

      const signatureUrl = publicUrlData.publicUrl;

      const { error: lockErr } = await supabase.from('clients').update({
        inquiries_locked: true,
        inquiries_signature_url: signatureUrl, 
        inquiries_locked_at: new Date().toISOString()
      }).eq('id', clientId);

      if (lockErr) throw lockErr;

      addToast({ title: "Inquiries Locked", message: "Signature saved successfully.", variant: "success", icon: "bi-lock-fill" });
      setShowSignatureModal(false);
      // Small delay so the toast is actually visible before the reload
      // wipes it (ToastProvider's state doesn't survive a hard reload).
      setTimeout(() => window.location.reload(), 900);

    } catch (err) {
      console.error(err);
      addToast({ title: "Failed to Lock Inquiries", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setIsLocking(false);
    }
  };

  const clearSignature = () => {
    sigCanvas.current.clear();
  };

  if (loading || loadingCredit) {
    return (
      <Container className="d-flex justify-content-center align-items-center vh-100">
        <Spinner animation="border" />
        <p className="ms-3 mb-0">Loading Client Profile…</p>
      </Container>
    );
  }

  if (error) return <Container className="mt-5"><Alert variant="danger">Error: {error}</Alert></Container>;
  if (!client) return <Container className="mt-5"><Alert variant="warning">Client not found.</Alert></Container>;

  // useClient.js selects "*", so client.service_id is already present once
  // sql/add_services.sql has run — resolveServiceId falls back to deriving
  // it from dispute_method otherwise. See utils/services.js.
  const isCreditRepair = resolveServiceId(client) === 'credit_repair';

  return (
    <Container fluid="xl" className="my-4 client-profile-page">
      {/* Header */}
      <div className="page-header mb-3 d-flex align-items-center justify-content-between flex-wrap gap-3">
        <div>
          <Button variant="outline-secondary" size="sm" onClick={() => navigate(`/company-portal/${companyId}/dashboard`)}>
            <i className="bi bi-arrow-left me-2" /> Back to Dashboard
          </Button>
          <div className="mt-2">
            <h2 className="mb-0">{client.full_name}</h2>
            <div className="d-flex align-items-center gap-2">
                <p className="text-muted mb-0">Client Profile &amp; Dashboard</p>
                <Badge bg={isCreditRepair ? "info" : "primary"} className="text-uppercase" style={{fontSize: '0.7rem'}}>
                    {serviceLabel(client)}
                </Badge>
            </div>
            {clientBlock && clientBlock.address ? <small className="text-muted">{clientBlock.address}</small> : null}
          </div>
        </div>
        
        {/* REPORT FETCH BUTTONS */}
        <div className="d-flex gap-2">
            <Dropdown>
              <Dropdown.Toggle variant="primary" className="fw-bold shadow-sm d-flex align-items-center">
                <i className="bi bi-cloud-arrow-down me-2"></i> Import Report
              </Dropdown.Toggle>
              <Dropdown.Menu className="shadow-lg border-secondary py-2">
                <Dropdown.Header className="text-primary fw-bold text-uppercase tracking-wide">Select Provider</Dropdown.Header>
                <Dropdown.Item onClick={() => setActiveModal("fetch3b")} className="py-2"><i className="bi bi-file-earmark-arrow-down me-2 text-muted"></i> SmartCredit</Dropdown.Item>
                <Dropdown.Item onClick={() => setActiveModal("parseIq")} className="py-2"><i className="bi bi-file-earmark-arrow-down me-2 text-muted"></i> IdentityIQ</Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>

            <Button 
                variant={client.inquiries_locked ? "secondary" : "danger"} 
                className="fw-bold shadow-sm d-flex align-items-center" 
                onClick={() => setShowInquiryModal(true)}
                disabled={client.inquiries_locked}
                title={client.inquiries_locked ? "Inquiry dispute process has been locked by the Admin team." : "Stage inquiries for dispute"}
            >
                <i className={`bi ${client.inquiries_locked ? "bi-lock-fill" : "bi-shield-x"} me-2`}></i>
                {client.inquiries_locked ? "Inquiries Locked" : "Dispute Inquiries"}
            </Button>
        </div>
      </div>
      
      {/* Alerts */}
      <Row>
        <Col>
          {creditError && (
              <Alert variant="warning" className="mb-4">
                  <i className="bi bi-exclamation-triangle-fill me-2"></i><strong>Credit File Notice:</strong> {creditError}
              </Alert>
          )}

          {/* 👇 RED ALERT FOR CRITICAL SPECIAL FORMS NOTES 👇 */}
          {client.special_forms_notes && (
            <Alert variant="danger" className="border-danger shadow-sm mb-3">
              <Alert.Heading className="h6 mb-2 fw-bold text-danger">
                <i className="bi bi-exclamation-octagon-fill me-2" />
                CRITICAL PRIORITY: Special Forms / Notes
              </Alert.Heading>
              <hr className="my-2 border-danger opacity-50" />
              <div className="fw-bold">
                <FormatNotes notes={client.special_forms_notes} />
              </div>
            </Alert>
          )}

          {client.recent_apps_notes && (
            <Alert variant="warning">
              <Alert.Heading className="h6 mb-2"><i className="bi bi-exclamation-triangle-fill me-2" />Do Not Remove These Inquiries</Alert.Heading>
              <FormatNotes notes={client.recent_apps_notes} />
            </Alert>
          )}
        </Col>
      </Row>

      {/* Docs & Vitals */}
      <Row className="mb-4">
        <Col>
          <Card className="mt-3 shadow-sm border-0">
            <Card.Header className="bg-white"><h5 className="mb-0 fw-bold">ID & Asset Tracking</h5></Card.Header>
            <Card.Body className="text-muted bg-light">
              <div className="mb-3 fw-bold">Photo ID + Proof of Address (30–60 days recent)</div>
              <CoverLetterAssets clientId={clientId} onChange={(urls) => setDocLinks(urls)} />
              {docLinks && (docLinks.licenseUrl || docLinks.ssnUrl || docLinks.poaUrl) ? (
                <div className="small mt-3 bg-white p-3 rounded border">
                  <div className="text-muted fw-bold mb-2">Signed Links (Valid 30 days):</div>
                  <div className="d-flex gap-3">
                    {docLinks.licenseUrl && <div><i className="bi bi-person-vcard text-primary me-1"></i><a href={docLinks.licenseUrl} target="_blank" rel="noreferrer" className="text-decoration-none fw-bold">License</a></div>}
                    {docLinks.ssnUrl && <div><i className="bi bi-file-text text-primary me-1"></i><a href={docLinks.ssnUrl} target="_blank" rel="noreferrer" className="text-decoration-none fw-bold">SSN</a></div>}
                    {docLinks.poaUrl && <div><i className="bi bi-house-door text-primary me-1"></i><a href={docLinks.poaUrl} target="_blank" rel="noreferrer" className="text-decoration-none fw-bold">POA</a></div>}
                  </div>
                </div>
              ) : null}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={6}>
          <Card className="shadow-sm border-0 h-100">
            <Card.Header className="bg-white d-flex justify-content-between align-items-center">
              <h5 className="mb-0 fw-bold">Client Vitals</h5>
              <Button variant="outline-primary" size="sm" onClick={() => setShowEditContact(true)}>
                <i className="bi bi-pencil-square me-1" />Edit Contact Info
              </Button>
            </Card.Header>
            <ListGroup variant="flush">
              <ListGroup.Item><strong>Email:</strong> {client.email || "N/A"}</ListGroup.Item>
              <ListGroup.Item><strong>Phone:</strong> {client.phone || "N/A"}</ListGroup.Item>
              <ListGroup.Item><strong>Address:</strong> {client.address || "N/A"}</ListGroup.Item>
              <ListGroup.Item><strong>Service:</strong> {serviceLabel(client)}</ListGroup.Item>
              <ListGroup.Item><strong>Joined:</strong> {client.createdAtFormatted}</ListGroup.Item>
              {clientBlock && clientBlock.dob && <ListGroup.Item><strong>DOB:</strong> {clientBlock.dob}</ListGroup.Item>}
              {clientBlock && clientBlock.ssn_last4 && <ListGroup.Item><strong>SSN (last 4):</strong> {clientBlock.ssn_last4}</ListGroup.Item>}
            </ListGroup>
          </Card>
        </Col>
        
        <Col md={6}>
          {/* 👇 REGULAR SPECIAL INSTRUCTIONS CARD 👇 */}
          {client.special_instructions_notes && (
            <Card className="shadow-sm border-info mb-4">
              <Card.Header className="bg-info bg-opacity-10 border-info text-dark">
                <h5 className="mb-0 fw-bold"><i className="bi bi-journal-text text-info me-2"></i>Special Instructions from Partner</h5>
              </Card.Header>
              <Card.Body className="bg-white text-dark" style={{ fontSize: "0.95rem" }}>
                <FormatNotes notes={client.special_instructions_notes} />
              </Card.Body>
            </Card>
          )}

          <Card className="shadow-sm border-0">
            <Card.Header className="bg-white"><h5 className="mb-0 fw-bold">Required Documents Checklist</h5></Card.Header>
            <Card.Body className="bg-light">
              <RequiredDocsChecklist value={reqChecks} onChange={(next) => setReqChecks(next)} />
              <div className="small text-muted mt-3"><i className="bi bi-lightbulb-fill text-warning me-1"></i>Tip: Upload assets above. Once uploaded, tick items here for quick tracking.</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <InquirySelectionModal 
        show={showInquiryModal} 
        onHide={() => setShowInquiryModal(false)} 
        clientId={clientId}
        onConfirm={handleConfirmInquiries}
      />

      {/* 👇 DRAWING SIGNATURE & LOCK MODAL 👇 */}
      <Modal show={showSignatureModal} onHide={() => setShowSignatureModal(false)} backdrop="static" centered>
        <Modal.Header closeButton className="bg-light">
          <Modal.Title className="h5 fw-bold text-danger">
            <i className="bi bi-pen-fill me-2"></i> Draw Signature to Lock
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-4">
          <Alert variant="warning" className="border-warning mb-4">
            <h6 className="fw-bold mb-1">Final Confirmation</h6>
            <p className="mb-0 small">
              You are staging <strong>{stagedInquiries.length} inquiries</strong>. Draw your signature below to verify these selections. Once locked, this file is sent to processing and cannot be edited.
            </p>
          </Alert>
          
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="fw-bold small text-muted text-uppercase">Draw Signature Here:</span>
              <Button variant="link" size="sm" className="text-danger p-0 text-decoration-none" onClick={clearSignature}>
                <i className="bi bi-eraser-fill me-1"></i>Clear
              </Button>
            </div>
            <div className="border rounded bg-light" style={{ width: '100%', height: '150px' }}>
              <SignatureCanvas 
                ref={sigCanvas}
                penColor="black"
                canvasProps={{ className: 'w-100 h-100 signature-canvas' }} 
              />
            </div>
          </div>

          <Button 
            variant="danger" 
            onClick={handleSignAndLock} 
            className="w-100 fw-bold py-2 shadow-sm d-flex align-items-center justify-content-center"
            disabled={isLocking}
          >
            {isLocking ? <Spinner size="sm" animation="border" className="me-2" /> : <i className="bi bi-lock-fill me-2"></i>}
            {isLocking ? "Uploading Signature & Locking..." : "Sign & Lock Inquiries"}
          </Button>
        </Modal.Body>
      </Modal>

      <EditContactInfoModal
        show={showEditContact}
        onHide={() => setShowEditContact(false)}
        client={client}
        editor={{ id: user?.id, name: fullName }}
        onSaved={refetch}
      />

      {/* MODALS MOUNTING ZONE */}
      {activeModal === 'fetch3b' && <Fetch3BModal show={true} onClose={closeModal} onSaved={handleModalSave} clientId={clientId} isUpdateMode={false} />}
      {activeModal === 'parseIq' && <ParseReportModal show={true} onClose={closeModal} onSaved={handleModalSave} clientId={clientId} isUpdateMode={false} />}

    </Container>
  );
}