import React, { useState, useEffect, useMemo } from 'react';
import { Container, Row, Col, Card, Button, Form, Nav, Badge, InputGroup, ListGroup, Spinner, Alert, Modal, Table } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import AddClientFormStandard from './AddClientFormStandard';
import GenerateInvoiceModal from './GenerateInvoiceModal'; 

// Import Utilities for Ops Engine
import { fetchEnrichedClients } from '../../../utils/clientsData';
import { attachFlags } from '../../../utils/clientFlags';
import { getCurrentAgingDays } from '../../../utils/aging';

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

const ONBOARDING_BUCKET = "onboarding-documents"; 

export default function ClientDocumentDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // --- Ops Engine State ---
  const [allClients, setAllClients] = useState([]);
  const [inboxFilter, setInboxFilter] = useState('leads'); // 'leads', 'missing_docs', 'tasks'
  
  // --- Client View State ---
  const [clientId, setClientId] = useState(null);
  const [client, setClient] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState('Notes'); 
  
  // --- General State ---
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // --- 1. Load Fleet-Wide Data (The Inbox) ---
  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const { clients } = await fetchEnrichedClients();
      const flaggedClients = attachFlags(clients, getCurrentAgingDays);
      setAllClients(flaggedClients);
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    loadDashboardData(); 
  }, []);

  // --- 2. Process Action Queues (CS / Onboarding Focus) ---
  const queues = useMemo(() => {
    // Unpaid clients who need to be converted/onboarded
    const newLeads = allClients.filter(c => !c.is_paid);
    // Paid clients who still haven't finished uploading their onboarding assets (ID, SSN, POA)
    const missingDocs = allClients.filter(c => c.is_paid && c.flags?.missingDocuments);
    // Clients with unresolved internal tasks (CS Tickets / Follow-ups)
    const supportTasks = allClients.filter(c => c.flags?.internalIssue);

    return { newLeads, missingDocs, supportTasks };
  }, [allClients]);

  // --- 3. Open Specific Client ---
  const handleSelectClient = async (selectedClient) => {
    try {
      setLoading(true);
      setClientId(selectedClient.id);
      setClient(selectedClient);
      
      // 👇 Default to Notes so the agent can instantly start logging the call 👇
      setActiveTab('Notes'); 
      
      const { data: docData } = await supabase.from('client_documents').select('*').eq('client_id', selectedClient.id);
      setDocuments(docData || []);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'danger', text: "Failed to load client profile." });
    } finally {
      setLoading(false);
    }
  };

  const handleBackToInbox = () => {
    setClientId(null);
    setClient(null);
    setDocuments([]);
    loadDashboardData(); 
  };

  // --- Search & Actions ---
  const handleSearch = async (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    if (term.length < 2) { setSearchResults([]); return; }
    
    const { data } = await supabase.from('clients').select('id, full_name, phone, email').ilike('full_name', `%${term}%`).limit(5);
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

      const { data: docData } = await supabase.from('client_documents').select('*').eq('client_id', clientId);
      setDocuments(docData || []);
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
    } catch (err) { setMessage({ type: 'danger', text: err.message }); }
    finally { setUploading(false); }
  };

  const renderLoading = () => <div className="p-5 text-center mt-5"><Spinner animation="border" variant="primary"/><p className="text-muted mt-3 fw-bold">Syncing Support Console...</p></div>;

  // --- Inbox View Render ---
  const renderInbox = () => {
    let displayList = [];
    let title = "";
    let icon = "";
    let colorClass = "";

    if (inboxFilter === 'leads') {
      displayList = queues.newLeads;
      title = "New Leads (Awaiting Onboarding)";
      icon = "bi-person-lines-fill";
      colorClass = "text-primary";
    } else if (inboxFilter === 'missing_docs') {
      displayList = queues.missingDocs;
      title = "Incomplete Onboarding (Missing Docs)";
      icon = "bi-file-earmark-x-fill";
      colorClass = "text-warning";
    } else if (inboxFilter === 'tasks') {
      displayList = queues.supportTasks;
      title = "Support Tasks / Internal Issues";
      icon = "bi-ticket-detailed-fill";
      colorClass = "text-danger";
    }

    return (
      <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
        <Card.Header className="bg-white py-3 border-bottom d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold"><i className={`me-2 ${icon} ${colorClass}`}></i>{title}</h5>
          <Badge bg="dark" className="fs-6 px-3">{displayList.length} Clients</Badge>
        </Card.Header>
        <Card.Body className="p-0">
          <Table hover responsive className="mb-0 align-middle">
            <thead className="bg-light text-muted small text-uppercase font-monospace">
              <tr>
                <th className="ps-4">Client Name</th>
                <th>Contact Info</th>
                <th>Assigned To</th>
                <th className="text-end pe-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayList.map(c => (
                <tr key={c.id} onClick={() => handleSelectClient(c)} className="cursor-pointer" style={{ transition: 'background-color 0.2s' }}>
                  <td className="ps-4 fw-bold text-dark">{c.full_name}</td>
                  <td>
                      <div className="small text-muted"><i className="bi bi-telephone-fill me-1"></i> {c.phone || 'No Phone'}</div>
                  </td>
                  <td className="text-muted">{c.admin_full_name || 'Unassigned'}</td>
                  <td className="text-end pe-4">
                    <Button size="sm" variant="outline-primary" className="fw-bold shadow-sm rounded-pill px-3">
                        Open File <i className="bi bi-arrow-right ms-1"></i>
                    </Button>
                  </td>
                </tr>
              ))}
              {displayList.length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center py-5 text-muted">
                    <i className="bi bi-check-circle-fill display-4 d-block mb-3 text-success opacity-50"></i>
                    <h5 className="fw-bold text-dark">Queue is empty!</h5>
                    <p className="mb-0">No clients currently need attention in this category.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    );
  };

  return (
    <Container fluid className="bg-light min-vh-100 p-0 font-sans">
      
      {/* 1. TOP SUB-HEADER */}
      <div className="bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center shadow-sm sticky-top" style={{zIndex: 1020}}>
        <div className="d-flex align-items-center gap-3">
          {clientId && (
             <Button variant="dark" size="sm" className="fw-bold px-3 shadow-sm rounded-pill" onClick={handleBackToInbox}>
                <i className="bi bi-arrow-left me-2"></i> Back to Inbox
             </Button>
          )}
          <h5 className="mb-0 fw-bold text-dark">
            {clientId ? (
                <>Client: <span className="text-primary">{client?.full_name}</span></>
            ) : (
                <>Customer Support <span className="text-primary">Console</span></>
            )}
          </h5>
        </div>
        
        {/* Search & Add Client Button Area */}
        <div className="d-flex align-items-center gap-3">
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
                  placeholder="Find client to log call..." 
                  className="border-start-0 ps-0 fw-medium" 
                  value={searchTerm}
                  onChange={handleSearch}
                  onFocus={() => { if(searchResults.length > 0) setShowResults(true); }}
                  onBlur={() => setTimeout(() => setShowResults(false), 200)} 
              />
            </InputGroup>
            {showResults && searchResults.length > 0 && (
              <ListGroup className="position-absolute w-100 shadow mt-1" style={{ zIndex: 1050 }}>
                  {searchResults.map(res => (
                      <ListGroup.Item key={res.id} action onClick={async () => { 
                          const fullClient = allClients.find(c => c.id === res.id);
                          if(fullClient) await handleSelectClient(fullClient); 
                          setSearchTerm(''); 
                      }}>
                          <div className="fw-bold">{res.full_name}</div>
                          <div className="small text-muted">{res.phone || res.email}</div>
                      </ListGroup.Item>
                  ))}
              </ListGroup>
            )}
          </div>

          <Button variant="link" className="text-danger p-0 ms-2" onClick={handleLogout} title="Sign Out">
            <i className="bi bi-box-arrow-right fs-4"></i>
          </Button>
        </div>
      </div>

      <Row className="g-0">
        
        {/* 2. LEFT SIDEBAR (Dynamic Queues vs Client Tabs) */}
        <Col md={2} className="bg-white border-end vh-100 d-none d-md-block position-sticky top-0 overflow-auto">
          <div className="p-3">
            
            {/* ACTION INBOX QUEUES */}
            <h6 className="text-uppercase text-muted small fw-bold mb-3 mt-2 letter-spacing-1">CS Queues</h6>
            <Nav className="flex-column gap-2 mb-4">
               <Nav.Link 
                 onClick={() => { setClientId(null); setInboxFilter('leads'); }}
                 className={`px-3 py-2 rounded-3 d-flex justify-content-between align-items-center shadow-sm border ${!clientId && inboxFilter === 'leads' ? 'bg-primary text-white border-primary' : 'bg-white text-dark border-light'}`}
               >
                 <span><i className="bi bi-person-lines-fill me-2 opacity-75"></i> New Leads</span>
                 <Badge bg={!clientId && inboxFilter === 'leads' ? 'light' : 'primary'} text={!clientId && inboxFilter === 'leads' ? 'primary' : 'light'} className="rounded-pill">{queues.newLeads.length}</Badge>
               </Nav.Link>

               <Nav.Link 
                 onClick={() => { setClientId(null); setInboxFilter('missing_docs'); }}
                 className={`px-3 py-2 rounded-3 d-flex justify-content-between align-items-center shadow-sm border ${!clientId && inboxFilter === 'missing_docs' ? 'bg-warning text-dark border-warning' : 'bg-white text-dark border-light'}`}
               >
                 <span><i className="bi bi-file-earmark-x-fill me-2 opacity-75"></i> Missing Docs</span>
                 <Badge bg={!clientId && inboxFilter === 'missing_docs' ? 'dark' : 'warning'} text={!clientId && inboxFilter === 'missing_docs' ? 'light' : 'dark'} className="rounded-pill">{queues.missingDocs.length}</Badge>
               </Nav.Link>

               <Nav.Link 
                 onClick={() => { setClientId(null); setInboxFilter('tasks'); }}
                 className={`px-3 py-2 rounded-3 d-flex justify-content-between align-items-center shadow-sm border ${!clientId && inboxFilter === 'tasks' ? 'bg-danger text-white border-danger' : 'bg-white text-dark border-light'}`}
               >
                 <span><i className="bi bi-ticket-detailed-fill me-2 opacity-75"></i> Support Tasks</span>
                 <Badge bg={!clientId && inboxFilter === 'tasks' ? 'light' : 'danger'} text={!clientId && inboxFilter === 'tasks' ? 'danger' : 'light'} className="rounded-pill">{queues.supportTasks.length}</Badge>
               </Nav.Link>
            </Nav>

            <hr className="my-4 opacity-10" />

            {/* CLIENT SPECIFIC TABS */}
            <h6 className="text-uppercase text-muted small fw-bold mb-3 letter-spacing-1">Client Workspace</h6>
            <Nav className="flex-column gap-1 mb-4" style={{ opacity: clientId ? 1 : 0.4, pointerEvents: clientId ? 'auto' : 'none' }}>
              {['Notes', 'Documents', 'Billing', 'Overview', 'Client Comments', 'Inquiry List', 'Timeline', 'Messages', 'Automations', 'Results'].map((tab, idx) => (
                <Nav.Link 
                  key={idx} 
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 rounded-3 fw-medium ${activeTab === tab && clientId ? 'bg-primary text-white shadow-sm' : 'text-secondary hover-bg-light'}`}
                >
                  <i className={`bi ${tab === 'Notes' ? 'bi-journal-text' : tab === 'Documents' ? 'bi-file-earmark-text-fill' : tab === 'Billing' ? 'bi-receipt' : 'bi-folder-fill'} me-2 opacity-75`}></i>
                  {tab}
                </Nav.Link>
              ))}
            </Nav>
          </div>
        </Col>

        {/* 3. CENTER CONTENT */}
        <Col md={8} className="p-4 bg-light">
          {message && <Alert variant={message.type} onClose={() => setMessage(null)} dismissible className="fw-bold shadow-sm border-0"><i className="bi bi-info-circle-fill me-2"></i> {message.text}</Alert>}

          {loading ? (
              renderLoading()
          ) : !clientId ? (
              // INBOX QUEUE VIEW
              <div className="animate-fade-in">
                  <h4 className="fw-bold text-dark mb-4">CS Console: <span className="text-muted fw-normal">Daily Operations</span></h4>
                  {renderInbox()}
              </div>
          ) : (
              // SPECIFIC CLIENT VIEW
              <div className="animate-fade-in">
                {/* Client Profile Header Card */}
                <Card className="border-0 shadow-sm mb-4 rounded-4 overflow-hidden">
                  <Card.Body className="p-4 d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-4">
                      <div className="bg-primary bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center text-primary fw-bold border border-primary border-opacity-25" style={{width: '64px', height: '64px', fontSize: '1.5rem'}}>
                          {client?.full_name?.charAt(0) || 'C'}
                      </div>
                      <div>
                        <h3 className="fw-bold mb-1 text-dark">{client.full_name}</h3>
                        <div className="d-flex align-items-center gap-3 small text-muted">
                          <span className="fw-bold"><i className="bi bi-clock-history me-1"></i> {client.agingDaysCurrent || 0} Days Processing</span>
                          <span className="border-start ps-3"><i className="bi bi-person-badge me-1"></i> {client.admin_full_name || 'Unassigned'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-end">
                       <Badge bg={client.is_paid ? "success" : "secondary"} className="fs-6 px-3 py-2 rounded-pill shadow-sm">
                         <i className={`bi ${client.is_paid ? "bi-check-circle-fill" : "bi-hourglass-split"} me-2`}></i> 
                         {client.is_paid ? 'ACTIVE CLIENT' : 'AWAITING ONBOARDING'}
                       </Badge>
                    </div>
                  </Card.Body>
                </Card>

                {/* Dynamic Tab Rendering */}
                {activeTab === 'Notes' && (
                   <NotesTab 
                      client={client} 
                      clientId={clientId} 
                      onRefresh={() => handleSelectClient(client)} 
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
                
                {activeTab === 'Billing' && (
                   <div className="bg-white p-4 rounded-4 shadow-sm border-0">
                      <ConsumerInvoices clientId={clientId} />
                   </div>
                )}

                {activeTab === 'Client Comments' && <div className="bg-white p-4 rounded-4 shadow-sm border-0"><CommentsSection clientId={clientId} /></div>}
                {activeTab === 'Overview' && <OverviewTab client={client} />}
                {activeTab === 'Inquiry List' && <InquiryListTab clientId={clientId} readonly={true} />} 
                {activeTab === 'Timeline' && <TimelineTab client={client} />}
                {activeTab === 'Messages' && <MessagesTab clientId={clientId} client={client} />}
                {activeTab === 'Automations' && <AutomationsTab clientId={clientId} client={client} />}
                {activeTab === 'Results' && <ResultsTab clientId={clientId} />}
                
              </div>
          )}
        </Col>

        {/* 4. RIGHT SIDEBAR (Live Call Context / Stats) */}
        <Col md={2} className="bg-white border-start p-4 d-none d-lg-block vh-100 position-sticky top-0">
            {clientId ? (
                // LIVE CALL CONTEXT SIDEBAR
                <div className="animate-fade-in">
                    <h6 className="fw-bold text-uppercase text-primary mb-4 letter-spacing-1" style={{fontSize: '0.75rem'}}>Live Call Context</h6>
                    
                    <Form.Group className="mb-4">
                        <Form.Label className="small text-muted fw-bold mb-1">Phone Number</Form.Label>
                        <div className="bg-light p-2 rounded small fw-bold text-dark border-0 d-flex justify-content-between align-items-center">
                            {client?.phone || 'Not Provided'}
                            {client?.phone && <i className="bi bi-clipboard cursor-pointer text-primary" onClick={() => navigator.clipboard.writeText(client.phone)} title="Copy Phone"></i>}
                        </div>
                    </Form.Group>

                    <Form.Group className="mb-4">
                        <Form.Label className="small text-muted fw-bold mb-1">Email Address</Form.Label>
                        <div className="bg-light p-2 rounded small fw-bold text-dark border-0 text-truncate d-flex justify-content-between align-items-center" title={client?.email}>
                            <span className="text-truncate me-2">{client?.email || 'Not Provided'}</span>
                            {client?.email && <i className="bi bi-clipboard cursor-pointer text-primary" onClick={() => navigator.clipboard.writeText(client.email)} title="Copy Email"></i>}
                        </div>
                    </Form.Group>

                    <Form.Group className="mb-4">
                        <Form.Label className="small text-muted fw-bold mb-1">Payment Status</Form.Label>
                        <div className={`p-2 rounded small fw-bold border-0 ${client?.is_paid ? 'bg-success bg-opacity-10 text-success' : 'bg-warning bg-opacity-10 text-dark'}`}>
                            {client?.is_paid ? 'Paid & Active' : 'Unpaid / New Lead'}
                        </div>
                    </Form.Group>

                    <hr className="my-4 opacity-10" />

                    <h6 className="fw-bold text-uppercase text-muted mb-3 letter-spacing-1" style={{fontSize: '0.75rem'}}>Onboarding Flags</h6>
                    <div className="d-flex flex-column gap-2">
                        {client?.flags?.missingDocuments ? (
                            <div className="bg-warning bg-opacity-10 text-dark p-2 rounded small fw-bold d-flex align-items-center">
                                <i className="bi bi-file-earmark-x-fill text-warning me-2 fs-5"></i> Missing ID/Utility
                            </div>
                        ) : (
                            <div className="bg-success bg-opacity-10 text-success p-2 rounded small fw-bold d-flex align-items-center">
                                <i className="bi bi-shield-check me-2 fs-5"></i> Docs Clear
                            </div>
                        )}

                        {client?.flags?.internalIssue && (
                            <div className="bg-danger bg-opacity-10 text-danger p-2 rounded small fw-bold d-flex align-items-center mt-2">
                                <i className="bi bi-ticket-detailed-fill me-2 fs-5"></i> Open Support Task
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // INBOX STATS SIDEBAR
                <div className="animate-fade-in">
                    <h6 className="fw-bold text-uppercase text-muted mb-4 letter-spacing-1" style={{fontSize: '0.75rem'}}>Daily CS Stats</h6>
                    <div className="d-flex flex-column gap-4">
                        <div>
                            <div className="text-primary small fw-bold text-uppercase">Leads to Call</div>
                            <div className="fs-3 fw-bold text-primary">{queues.newLeads.length}</div>
                        </div>
                        <div>
                            <div className="text-warning small fw-bold text-uppercase">Missing Docs</div>
                            <div className="fs-3 fw-bold text-warning">{queues.missingDocs.length}</div>
                        </div>
                        <div>
                            <div className="text-danger small fw-bold text-uppercase">Open Tasks</div>
                            <div className="fs-3 fw-bold text-danger">{queues.supportTasks.length}</div>
                        </div>
                    </div>
                </div>
            )}
        </Col>
      </Row>

      {/* Modals */}
      <Modal show={showAddClientModal} onHide={() => setShowAddClientModal(false)} size="lg" centered backdrop="static">
        <Modal.Header closeButton className="border-bottom-0 pb-0"></Modal.Header>
        <Modal.Body className="pt-0">
          <AddClientFormStandard onClientAdded={() => {
              setShowAddClientModal(false);
              loadDashboardData(); 
          }} />
        </Modal.Body>
      </Modal>

      <GenerateInvoiceModal 
        show={showInvoiceModal} 
        onHide={() => setShowInvoiceModal(false)} 
      />

    </Container>
  );
}