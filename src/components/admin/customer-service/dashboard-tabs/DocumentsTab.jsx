import React, { useRef, useState } from 'react';
import { Row, Col, Card, Button, ProgressBar, Spinner } from 'react-bootstrap';
import { downloadReactPdf } from '../../../../utils/downloadReactPdf'; 
import { LPOADoc } from '../../../../pdf/LPOADoc'; 
import { BankAuthDoc } from '../../../../pdf/BankAuthDoc'; // <--- NEW IMPORT
import { useToast } from '../../../shared/ui/ToastNotifier';

export default function DocumentsTab({ client, documents, uploading, onUpload, onView, onForward }) {
  const { addToast } = useToast();
  const condoInputRef = useRef(null);
  const lpoaInputRef = useRef(null);
  const bankInputRef = useRef(null);
  
  const [generatingLPOA, setGeneratingLPOA] = useState(false);
  const [generatingBankAuth, setGeneratingBankAuth] = useState(false); // <--- NEW STATE

  // Helper to trigger parent upload and clear input
  const handleFileChange = async (e, type, ref) => {
    if (e.target.files && e.target.files[0]) {
      await onUpload(e.target.files[0], type);
      if (ref.current) ref.current.value = ''; 
    }
  };

  const hasDoc = (keyword) => documents.some(d => d.file_name.toLowerCase().includes(keyword.toLowerCase()));
  
  const requiredDocs = ['condo', 'lpoa', 'bank'];
  const uploadedCount = requiredDocs.filter(d => hasDoc(d)).length;
  const progressPercent = Math.round((uploadedCount / requiredDocs.length) * 100);

  // --- GENERATE LPOA PDF ---
  const handleGenerateLPOA = async () => {
    try {
      setGeneratingLPOA(true);
      const name = client?.full_name || "Client";
      const fileName = `LPOA_${name.replace(/\s+/g, '_')}.pdf`;
      await downloadReactPdf(<LPOADoc clientName={name} />, fileName);
    } catch (e) {
      console.error("Generate LPOA Error:", e);
      addToast({ title: "Generation Failed", message: "Failed to generate LPOA PDF.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setGeneratingLPOA(false);
    }
  };

  // --- NEW: GENERATE BANK AUTH PDF ---
  const handleGenerateBankAuth = async () => {
    try {
      setGeneratingBankAuth(true);
      const name = client?.full_name || "Client";
      const fileName = `BankAuth_${name.replace(/\s+/g, '_')}.pdf`;
      await downloadReactPdf(<BankAuthDoc clientName={name} />, fileName);
    } catch (e) {
      console.error("Generate Bank Auth Error:", e);
      addToast({ title: "Generation Failed", message: "Failed to generate Bank Auth PDF.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setGeneratingBankAuth(false);
    }
  };

  return (
    <>
      <h5 className="fw-bold text-dark mb-3">Upload Required Documents</h5>
      
      {/* Hidden Inputs */}
      <input type="file" style={{display:'none'}} ref={condoInputRef} onChange={(e) => handleFileChange(e, 'CONDO', condoInputRef)} />
      <input type="file" style={{display:'none'}} ref={lpoaInputRef} onChange={(e) => handleFileChange(e, 'LPOA', lpoaInputRef)} />
      <input type="file" style={{display:'none'}} ref={bankInputRef} onChange={(e) => handleFileChange(e, 'BANK', bankInputRef)} />

      <Row className="g-3 mb-4">
        {/* 1. CONDO FORM CARD */}
        <Col md={4}>
            <Card className={`text-center h-100 border-0 shadow-sm p-3 ${hasDoc('condo') ? 'border-success border-2' : ''}`}>
                <Card.Body>
                    <h6 className="fw-bold text-dark mb-3">Signed Condo Form</h6>
                    <div className="mb-3 text-secondary opacity-50">
                        <i className="bi bi-file-earmark-text display-4"></i>
                        <div className="fw-bold small mt-1 bg-dark text-white rounded py-1 px-2 d-inline-block">CONDO</div>
                    </div>
                    
                    {hasDoc('condo') ? (
                        <Button variant="outline-success" size="sm" className="w-100 mb-2 fw-bold" onClick={() => onView('condo')}>
                            <i className="bi bi-eye"></i> View CONDO
                        </Button>
                    ) : (
                        <Button variant="primary" size="sm" className="w-100 mb-2 fw-bold" disabled={uploading} onClick={() => condoInputRef.current.click()}>
                            {uploading ? '...' : 'Upload CONDO'}
                        </Button>
                    )}
                    
                    {/* Link to Cognito Form */}
                    <div className="mt-2 pt-2 border-top">
                        <a 
                            href="https://www.cognitoforms.com/LTOutsourcingSolutions1/TheTokenSocietyPartnerEnrollment" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-decoration-none small fw-bold text-info"
                        >
                            <i className="bi bi-box-arrow-up-right me-1"></i> Partner Enrollment Form
                        </a>
                    </div>

                    <div className={hasDoc('condo') ? "text-success small fw-bold mt-2" : "text-muted small mt-2"}>
                        <i className={`bi ${hasDoc('condo') ? 'bi-check-circle-fill' : 'bi-circle'} me-1`}></i> 
                        {hasDoc('condo') ? 'File Received' : 'Pending Upload'}
                    </div>
                </Card.Body>
            </Card>
        </Col>

        {/* 2. LPOA CARD */}
        <Col md={4}>
            <Card className={`text-center h-100 border-0 shadow-sm p-3 ${hasDoc('lpoa') ? 'border-success border-2' : ''}`}>
                <Card.Body>
                    <h6 className="fw-bold text-dark mb-3">Limited Power of Attorney (LPOA)</h6>
                    <div className="mb-3 text-secondary opacity-50">
                        <i className="bi bi-file-earmark-lock display-4"></i>
                        <div className="fw-bold small mt-1 bg-dark text-white rounded py-1 px-2 d-inline-block">LPOA</div>
                    </div>
                    
                    {hasDoc('lpoa') ? (
                        <Button variant="outline-success" size="sm" className="w-100 mb-2 fw-bold" onClick={() => onView('lpoa')}>
                            <i className="bi bi-eye"></i> View LPOA
                        </Button>
                    ) : (
                        <Button variant="primary" size="sm" className="w-100 mb-2 fw-bold" disabled={uploading} onClick={() => lpoaInputRef.current.click()}>
                            {uploading ? '...' : 'Upload LPOA'}
                        </Button>
                    )}

                    {/* Generate LPOA Button */}
                    <div className="mt-2 pt-2 border-top">
                        <button 
                            className="btn btn-link text-decoration-none small fw-bold text-dark p-0 border-0"
                            onClick={handleGenerateLPOA}
                            disabled={generatingLPOA}
                        >
                            {generatingLPOA ? <span className="spinner-border spinner-border-sm me-1"/> : <i className="bi bi-file-earmark-pdf me-1"></i>}
                            Generate LPOA PDF
                        </button>
                    </div>

                    <div className={hasDoc('lpoa') ? "text-success small fw-bold mt-2" : "text-muted small mt-2"}>
                        <i className={`bi ${hasDoc('lpoa') ? 'bi-check-circle-fill' : 'bi-circle'} me-1`}></i> 
                        {hasDoc('lpoa') ? 'File Received' : 'Pending Upload'}
                    </div>
                </Card.Body>
            </Card>
        </Col>

        {/* 3. BANK AUTH CARD */}
        <Col md={4}>
            <Card className={`text-center h-100 border-0 shadow-sm p-3 ${hasDoc('bank') ? 'border-success border-2' : ''}`}>
                <Card.Body>
                    <h6 className="fw-bold text-dark mb-3">Bank Authorization Letter</h6>
                    <div className="mb-3 text-secondary opacity-50">
                        <i className="bi bi-bank display-4"></i>
                        <div className="fw-bold small mt-1 bg-dark text-white rounded py-1 px-2 d-inline-block">BANK</div>
                    </div>
                    
                    {hasDoc('bank') ? (
                        <Button variant="outline-success" size="sm" className="w-100 mb-2 fw-bold" onClick={() => onView('bank')}>
                            <i className="bi bi-eye"></i> View BANK
                        </Button>
                    ) : (
                        <Button variant="primary" size="sm" className="w-100 mb-2 fw-bold" disabled={uploading} onClick={() => bankInputRef.current.click()}>
                            {uploading ? '...' : 'Upload BANK'}
                        </Button>
                    )}

                    {/* NEW: Generate Bank Auth Button */}
                    <div className="mt-2 pt-2 border-top">
                        <button 
                            className="btn btn-link text-decoration-none small fw-bold text-dark p-0 border-0"
                            onClick={handleGenerateBankAuth}
                            disabled={generatingBankAuth}
                        >
                            {generatingBankAuth ? <span className="spinner-border spinner-border-sm me-1"/> : <i className="bi bi-file-earmark-pdf me-1"></i>}
                            Generate Bank Auth PDF
                        </button>
                    </div>
                    
                    <div className={hasDoc('bank') ? "text-success small fw-bold mt-2" : "text-muted small mt-2"}>
                        <i className={`bi ${hasDoc('bank') ? 'bi-check-circle-fill' : 'bi-circle'} me-1`}></i> 
                        {hasDoc('bank') ? 'File Received' : 'Pending Upload'}
                    </div>
                </Card.Body>
            </Card>
        </Col>
      </Row>

      <Row className="mb-4">
        <Col md={12}>
            <Card className="border-0 shadow-sm h-100">
                <Card.Body>
                    <div className="d-flex justify-content-between mb-2 fw-bold">
                        <span className={progressPercent === 100 ? "text-success" : "text-dark"}>
                            <i className={`bi ${progressPercent === 100 ? 'bi-check-circle-fill' : 'bi-circle'} me-2`}></i> 
                            {progressPercent === 100 ? 'All documents received' : `${uploadedCount}/3 Documents Received`}
                        </span>
                    </div>
                    <ProgressBar variant={progressPercent === 100 ? "success" : "primary"} now={progressPercent} style={{height: '8px'}} className="mb-3" />
                    <div className="d-flex justify-content-between small text-muted">
                        <span><i className="bi bi-arrow-return-right me-1"></i> Date Submitted - {new Date(client.created_at).toLocaleDateString()}</span>
                        <span><i className={`bi ${progressPercent === 100 ? 'bi-check-lg text-success' : 'bi-circle'} me-1`}></i> Docs Approved</span>
                        <span><i className="bi bi-circle me-1"></i> Inquiry Count Completed</span>
                    </div>
                </Card.Body>
            </Card>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm mb-4">
        <Card.Body>
            <h6 className="fw-bold mb-3">Customer Service Script</h6>
            <div className="d-flex gap-3">
                <div className="flex-grow-1 bg-light p-3 rounded border">
                    <div className="fw-bold mb-2">Request: Missing Document.</div>
                    <p className="mb-0 text-muted small">
                        Hi {client?.full_name?.split(' ')[0]}: we're missing your Proof of Address to continue your case. Please upload it today so we can keep your processing active.
                    </p>
                </div>
                <div className="d-flex flex-column gap-2">
                    <Button variant="primary" size="sm" className="fw-bold" style={{backgroundColor: '#1e3a8a'}} onClick={() => navigator.clipboard.writeText(`Hi ${client.full_name.split(' ')[0]}...`)}>Copy Script</Button>
                    <Button variant="primary" size="sm" className="fw-bold" style={{backgroundColor: '#1e3a8a'}}>Send via SMS</Button>
                    <Button variant="primary" size="sm" className="fw-bold" style={{backgroundColor: '#1e3a8a'}}>Send via Email</Button>
                </div>
            </div>
        </Card.Body>
      </Card>

      <Button size="lg" className="w-100 fw-bold py-3 shadow" style={{backgroundColor: '#1e3a8a', borderColor: '#1e3a8a'}} onClick={onForward} disabled={uploading}>
        {uploading ? <Spinner animation="border" size="sm"/> : <>Forward Case to Dispute Manager <i className="bi bi-arrow-right ms-2"></i></>}
      </Button>
    </>
  );
}