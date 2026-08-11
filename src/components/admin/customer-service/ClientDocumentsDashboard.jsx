import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Form, Nav, Badge, InputGroup, ListGroup, Spinner, Alert, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import AddClientFormStandard from './AddClientFormStandard';

// 👇 IMPORT THE NEW INVOICE MODAL 👇
import GenerateInvoiceModal from './GenerateInvoiceModal'; 

// Import Tabs
import DocumentsTab from './dashboard-tabs/DocumentsTab';
import InquiryListTab from './dashboard-tabs/InquiryListTab';
import TimelineTab from './dashboard-tabs/Timelinetab';
import OverviewTab from './dashboard-tabs/OverviewTab';
import NotesTab from './dashboard-tabs/NotesTab'; 
import MessagesTab from './dashboard-tabs/MessagesTab'; 
import { AutomationsTab } from './dashboard-tabs/PlaceholderTabs';
import CommentsSection from '../client-profile/CommentsSection';
import ConsumerInvoices from '../../individual/modals/ConsumerInvoices'; 
import ResultsTab from './dashboard-tabs/ResultsTab';

// Dedicated Bucket for Onboarding Docs
const ONBOARDING_BUCKET = "onboarding-documents"; 

export default function ClientDocumentDashboard() {
  // /cs-dashboard is a standalone route (see App.jsx) — it isn't wrapped by
  // AdminLayout/AdminNavbar the way the rest of the admin portal is, so it
  // never inherited a logout button. Same signOut()-then-navigate pattern
  // as AdminNavbar.jsx's handleLogout, just placed in this page's own
  // header instead.
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // --- State ---
  const [activeTab, setActiveTab] = useState('Billing'); 
  
  // 👇 Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  
  const [clientId, setClientId] = useState(null);
  const [client, setClient] = useState(null);
  const [documents, setDocuments] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);

  const [showAddClientModal, setShowAddClientModal] = useState(false);

  // --- Initial Load ---
  useEffect(() => {
    const fetchInitial = async () => {
      try {
        setLoading(true);
        const { data } = await supabase.from('clients').select('id').order('created_at', { ascending: false }).limit(1);
        if (data?.[0]) setClientId(data[0].id);
        else setLoading(false);
      } catch (err) { setLoading(false); console.error(err); }
    };
    fetchInitial();
  }, []);

  // --- Fetch Data ---
  const fetchClientData = async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const { data: clientData } = await supabase.from('clients').select('*').eq('id', clientId).single();
      const { data: docData } = await supabase.from('client_documents').select('*').eq('client_id', clientId);
      
      if (clientData?.company_id) {
          const { data: company } = await supabase.from('companies').select('company_name').eq('id', clientData.company_id).single();
          if (company) clientData.company_name = company.company_name;
      }

      setClient(clientData);
      setDocuments(docData || []);
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchClientData(); }, [clientId]);

  // --- Actions ---
  const handleSearch = async (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    if (term.length < 2) { setSearchResults([]); return; }
    
    const { data } = await supabase.from('clients').select('id, full_name').ilike('full_name', `%${term}%`).limit(5);
    setSearchResults(data || []);
    setShowResults(true);
  };

  const handleUpload = async (file, typePrefix) => {
    try {
      setUploading(true);
      setMessage(null);
      const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]/g, '_');
      const finalName = `${typePrefix}_${Date.now()}_${safeName}`;
      const path = `${clientId}/${finalName}`;

      const { error: upErr } = await supabase.storage.from(ONBOARDING_BUCKET).upload(path, file);
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from('client_documents').insert({
          client_id: clientId, file_name: finalName, file_url: path, uploaded_by: user?.id
      });
      if (dbErr) throw dbErr;

      await fetchClientData();
      setMessage({ type: 'success', text: 'Upload successful!' });
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleView = async (docCode) => {
    try {
        const doc = documents.find(d => d.file_name.toLowerCase().includes(docCode.toLowerCase()));
        if (!doc) return;
        const { data } = await supabase.storage.from(ONBOARDING_BUCKET).createSignedUrl(doc.file_url, 60);
        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch (err) { console.error(err); }
  };

  const handleForward = async () => {
    if (!confirm("Forward to Dispute Manager?")) return;
    try {
        setUploading(true);
        await supabase.from('clients').update({ status_stage: 'dispute_manager_review' }).eq('id', clientId);
        setMessage({ type: 'success', text: "Case forwarded!" });
        fetchClientData();
    } catch (err) { setMessage({ type: 'danger', text: err.message }); }
    finally { setUploading(false); }
  };

  const renderLoading = () => <div className="p-5 text-center"><Spinner animation="border"/></div>;

  return (
    <Container fluid className="bg-light min-vh-100 p-0 font-sans">
      
      {/* 1. TOP SUB-HEADER (Client Context) */}
      <div className="bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center shadow-sm sticky-top" style={{zIndex: 1020}}>
        <div>
          <h5 className="mb-0 fw-bold text-dark">
            Client: <span className="text-primary">{loading ? 'Loading...' : client?.full_name || 'Select Client'}</span> 
            <span className="text-muted fw-normal mx-2">/</span> 
            <small className="text-muted">Status:</small> {loading ? '...' : (client?.status || 'Active')}
          </h5>
        </div>
        
        {/* Search & Add Client Button Area */}
        <div className="d-flex align-items-center gap-3">
          
          {/* 👇 UPDATED: Onboard Lead Button 👇 */}
          <Button variant="primary" size="sm" className="fw-bold shadow-sm d-flex align-items-center text-nowrap bg-white" onClick={() => setShowInvoiceModal(true)}>
             <i className="bi bi-send-plus-fill me-2"></i> Onboard Lead
          </Button>

          <Button variant="primary" size="sm" className="fw-bold shadow-sm d-flex align-items-center text-nowrap" onClick={() => setShowAddClientModal(true)}>
             <i className="bi bi-person-plus-fill me-2"></i> Add Client
          </Button>

          <div style={{ width: '300px', position: 'relative' }}>
            <InputGroup size="sm">
              <InputGroup.Text className="bg-white border-end-0">
                  <i className="bi bi-search text-muted"></i>
              </InputGroup.Text>
              <Form.Control 
                  placeholder="Search list..." 
                  className="border-start-0 ps-0" 
                  value={searchTerm}
                  onChange={handleSearch}
                  onFocus={() => { if(searchResults.length > 0) setShowResults(true); }}
                  onBlur={() => setTimeout(() => setShowResults(false), 200)} 
              />
            </InputGroup>
            {showResults && searchResults.length > 0 && (
              <ListGroup className="position-absolute w-100 shadow mt-1" style={{ zIndex: 1050 }}>
                  {searchResults.map(res => (
                      <ListGroup.Item key={res.id} action onClick={() => { setClientId(res.id); setSearchTerm(''); }}>{res.full_name}</ListGroup.Item>
                  ))}
              </ListGroup>
            )}
          </div>

          <Button variant="link" className="text-danger p-0" onClick={handleLogout} title="Sign Out">
            <i className="bi bi-box-arrow-right fs-4"></i>
          </Button>
        </div>
      </div>

      <Row className="g-0">
        
        {/* 2. LEFT SIDEBAR (Navigation & Actions) */}
        <Col md={2} className="bg-white border-end vh-100 d-none d-md-block position-sticky top-0 overflow-auto">
          <div className="p-3">
            <Form.Control size="sm" type="text" placeholder="Search..." className="mb-3 bg-light" />
            
            <Nav className="flex-column gap-1 mb-4">
              {['Billing', 'Client Comments', 'Overview', 'Documents', 'Inquiry List', 'Timeline', 'Messages', 'Notes', 'Automations', 'Results'].map((tab, idx) => (
                <Nav.Link 
                  key={idx} 
                  onClick={() => setActiveTab(tab)}
                  className={`px-2 py-2 rounded ${activeTab === tab ? 'bg-primary text-white fw-bold' : 'text-secondary hover-bg-light'}`}
                  style={{cursor: 'pointer'}}
                >
                  <i className={`bi ${tab === 'Documents' ? 'bi-file-earmark-text-fill' : tab === 'Billing' ? 'bi-receipt' : 'bi-folder'} me-2`}></i>
                  {tab}
                </Nav.Link>
              ))}
            </Nav>

            <hr className="my-4" />

            <h6 className="text-uppercase text-muted small fw-bold mb-3">Quick Actions</h6>
            <div className="small text-muted d-flex flex-column gap-2">
              <div className="d-flex justify-content-between">
                <span>Last SMS:</span>
                <span className="text-dark">Yesterday 6:46 PM</span>
              </div>
              <div className="d-flex justify-content-between">
                <span>Last Email:</span>
                <span className="text-dark">April 27 0:10:30 AM</span>
              </div>
              <div className="d-flex justify-content-between">
                <span>Next Follow Up:</span>
                <span className="text-dark">5/00/2024</span>
              </div>
              <div className="d-flex justify-content-between">
                <span>Call Scheduled:</span>
                <span className="fw-bold text-success">Yes</span>
              </div>
            </div>
          </div>
        </Col>

        {/* 3. CENTER CONTENT (Workspace) */}
        <Col md={8} className="p-4" style={{ backgroundColor: '#ffffff00' }}>
          
          {message && <Alert variant={message.type} onClose={() => setMessage(null)} dismissible>{message.text}</Alert>}

          {/* Internal Tabs */}
          <Nav variant="tabs" activeKey={activeTab} className="mb-4 border-bottom-0">
            {['Billing', 'Overview', 'Documents', 'Inquiry List', 'Timeline', 'Messages', 'Notes', 'Automations', 'Results'].map((tab, idx) => (
              <Nav.Item key={idx}>
                <Nav.Link eventKey={tab} onClick={() => setActiveTab(tab)} className={activeTab === tab ? 'fw-bold active border-bottom-0 bg-white' : 'text-muted border-0 bg-transparent'}>
                    {tab}
                </Nav.Link>
              </Nav.Item>
            ))}
          </Nav>

          {(loading && !client) ? renderLoading() : client && (
              <>
              {/* Client Profile Card (Always Visible) */}
              <Card className="border-0 shadow-sm mb-4">
                <Card.Body className="d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-3">
                    <div className="bg-dark rounded-circle d-flex align-items-center justify-content-center text-white fw-bold" style={{width: '48px', height: '48px'}}>
                        <img src={`https://ui-avatars.com/api/?name=${client.full_name}&background=0D8ABC&color=fff`} className="rounded-circle img-fluid" alt="Avatar"/>
                    </div>
                    <div>
                      <h4 className="fw-bold mb-1">{client.full_name}</h4>
                      <div className="d-flex align-items-center gap-2 small">
                        <span className="fw-bold text-muted"><i className="bi bi-arrow-right me-1"></i> Experian</span>
                        <span className="fw-bold text-primary"><i className="bi bi-check2 me-1"></i> Equifax</span>
                        <Badge bg="secondary" className="text-light">T</Badge>
                        <Badge bg="success" className="text-light">FVIX</Badge>
                        <span className="text-muted ms-2 border-start ps-2">Partner: 3 - Jane Simmons</span>
                      </div>
                    </div>
                  </div>
                  <Button variant={client.status_stage === 'dispute_manager_review' ? "success" : "warning"} className="text-dark fw-bold px-4">
                    <i className="bi bi-clock-history me-2"></i> {client.status_stage ? client.status_stage.replace(/_/g,' ').toUpperCase() : 'Ready for Review'}
                  </Button>
                </Card.Body>
              </Card>

              {/* Dynamic Tab Rendering */}
              {activeTab === 'Billing' && (
                 <div className="bg-white p-3 rounded shadow-sm border">
                    <ConsumerInvoices clientId={clientId} />
                 </div>
              )}

              {activeTab === 'Client Comments' && <CommentsSection clientId={clientId} />}
              {activeTab === 'Overview' && <OverviewTab client={client} />}
              {activeTab === 'Inquiry List' && <InquiryListTab clientId={clientId} readonly={true} />} 
              {activeTab === 'Timeline' && <TimelineTab client={client} />}
              {activeTab === 'Messages' && <MessagesTab clientId={clientId} client={client} />}
              {activeTab === 'Automations' && <AutomationsTab clientId={clientId} client={client} />}
              {activeTab === 'Results' && <ResultsTab clientId={clientId} />}
              
              {activeTab === 'Notes' && (
                 <NotesTab 
                    client={client} 
                    clientId={clientId} 
                    onRefresh={fetchClientData} 
                 />
              )}
              
              {activeTab === 'Documents' && (
                 <DocumentsTab 
                     client={client} 
                     documents={documents} 
                     uploading={uploading} 
                     onUpload={handleUpload} 
                     onView={handleView} 
                     onForward={handleForward}
                 />
              )}
              </>
          )}
        </Col>

        {/* 4. RIGHT SIDEBAR */}
        <Col md={2} className="bg-white border-start p-3 d-none d-lg-block vh-100 position-sticky top-0">
            <Form.Group className="mb-3">
                <Form.Label className="small text-muted fw-bold">Status:</Form.Label>
                <Form.Select size="sm" defaultValue="In Progress">
                    <option>Ready for Review</option>
                    <option>In Progress</option>
                    <option>On Hold</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
                <Form.Label className="small text-muted fw-bold">Assigned To:</Form.Label>
                <Form.Select size="sm">
                    <option>Dispute Manager</option>
                    <option>Agent 1</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
                <Form.Label className="small text-muted fw-bold">Priority:</Form.Label>
                <Form.Select size="sm">
                    <option>Normal</option>
                    <option>High</option>
                    <option>Urgent</option>
                </Form.Select>
            </Form.Group>

            <Form.Group className="mb-4">
                 <Form.Control type="date" size="sm" defaultValue="2024-05-03" />
            </Form.Group>

            <hr />

            <h6 className="fw-bold small text-muted mb-3"><i className="bi bi-clock-fill me-1"></i> Alerts</h6>
            <div className="d-flex flex-column gap-2 mb-4">
                <div className="bg-light p-2 rounded small d-flex align-items-center">
                    <i className="bi bi-shield-fill-check text-success me-2 fs-5"></i> 
                    <span className="fw-bold text-secondary">Docs complete</span>
                </div>
                <div className="bg-light p-2 rounded small d-flex align-items-center">
                    <i className="bi bi-exclamation-triangle-fill text-warning me-2 fs-5"></i> 
                    <span className="fw-bold text-secondary">Waiting on updated report</span>
                </div>
                <div className="bg-light p-2 rounded small d-flex align-items-center">
                    <i className="bi bi-star-fill text-danger me-2 fs-5"></i> 
                    <span className="fw-bold text-secondary">VIP client / Priority</span>
                </div>
            </div>

            <h6 className="fw-bold small text-muted mb-3"><i className="bi bi-flag-fill me-1"></i> F Alerts</h6>
            <div className="d-flex flex-column gap-2">
                 <div className="d-flex align-items-center small text-secondary">
                    <i className="bi bi-check-square-fill text-success me-2"></i> Docs complete
                 </div>
                 <div className="d-flex align-items-center small text-secondary">
                    <i className="bi bi-telephone-fill text-primary me-2"></i> Send via SMS
                 </div>
                 <div className="d-flex align-items-center small text-secondary">
                    <i className="bi bi-envelope-fill text-primary me-2"></i> Send via Email
                 </div>
            </div>

        </Col>
      </Row>

      {/* Add Client Modal */}
      <Modal show={showAddClientModal} onHide={() => setShowAddClientModal(false)} size="lg" centered>
        <Modal.Header closeButton className="border-bottom-0 pb-0"></Modal.Header>
        <Modal.Body className="pt-0">
          <AddClientFormStandard onClientAdded={() => {
              setShowAddClientModal(false);
              fetchClientData(); 
          }} />
        </Modal.Body>
      </Modal>

      {/* 👇 NEW: GENERATE INVOICE MODAL (For New Leads) 👇 */}
      <GenerateInvoiceModal 
        show={showInvoiceModal} 
        onHide={() => setShowInvoiceModal(false)} 
      />

    </Container>
  );
}