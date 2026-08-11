import React, { useState } from 'react';
import { Container, Card, Row, Col, Button, Form, Badge, ProgressBar, Spinner } from 'react-bootstrap';
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../shared/ui/ToastNotifier";

import { 
  CALLER_TYPES, CATEGORIES, SUB_ISSUES, REQUIRED_CHECKS, SCRIPTS_AND_ACTIONS 
} from "../../utils/supportConstants"; 

// ============================================================================
// ⚙️ CONFIGURATION: Single Central Webhook URL
// ============================================================================
const WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/9ecfe892-5e69-4882-8b58-a6401bc839d3";
// ============================================================================

export default function SupportConsole() {
  const { addToast } = useToast();
  const { userId } = useAuth();
  
  // --- STATE ---
  const [step, setStep] = useState(1);
  const [selections, setSelections] = useState({ callerType: '', category: '', subIssue: '' });
  
  // Client Identity State
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  
  // New Lead Capture State
  const [newLeadForm, setNewLeadForm] = useState({ name: "", email: "", phone: "" });
  const [isAddingLead, setIsAddingLead] = useState(false);

  // Resolution State
  const [completedChecks, setCompletedChecks] = useState([]);
  const [isLogging, setIsLogging] = useState(false);
  const [callLogged, setCallLogged] = useState(false);
  
  // Track loading state for the individual Action Buttons
  const [actionLoading, setActionLoading] = useState({});

  // --- CORE HANDLERS ---
  const handleSelect = (level, value) => {
    const newSelections = { ...selections, [level]: value };
    
    if (level === 'callerType') { 
        newSelections.category = ''; 
        newSelections.subIssue = ''; 
        setSelectedClient(null);
        setSearchQuery("");
        setNewLeadForm({ name: "", email: "", phone: "" });
        setStep(2); 
    } else if (level === 'category') { 
        newSelections.subIssue = ''; 
        setStep(4); 
    } else if (level === 'subIssue') {
        setStep(5); 
    }
    
    setSelections(newSelections);
    setCompletedChecks([]); 
  };

  const toggleCheck = (checkIndex) => {
    setCompletedChecks(prev => 
      prev.includes(checkIndex) ? prev.filter(c => c !== checkIndex) : [...prev, checkIndex]
    );
  };

  const handleGoBack = (targetStep) => {
      setStep(targetStep);
      setCompletedChecks([]); 
      
      if (targetStep === 1) {
          setSelections({ callerType: '', category: '', subIssue: '' });
          setSelectedClient(null);
      } else if (targetStep === 2) {
          setSelectedClient(null);
          setSelections(prev => ({ ...prev, category: '', subIssue: '' }));
      } else if (targetStep === 3) {
          setSelections(prev => ({ ...prev, category: '', subIssue: '' }));
      } else if (targetStep === 4) {
          setSelections(prev => ({ ...prev, subIssue: '' }));
      }
  };

  const resetConsole = () => {
    setStep(1);
    setSelections({ callerType: '', category: '', subIssue: '' });
    setCompletedChecks([]);
    setCallLogged(false);
    setSelectedClient(null);
    setSearchQuery("");
    setNewLeadForm({ name: "", email: "", phone: "" });
    setActionLoading({});
  };

  // --- API HANDLERS ---
  const searchClients = async (query) => {
    setSearchQuery(query);
    if (query.length < 3) return setClients([]);
    
    const { data } = await supabase
        .from('clients')
        .select('id, full_name, email, phone')
        .ilike('full_name', `%${query}%`)
        .limit(5);
    setClients(data || []);
  };

  const handleAttachClient = (clientObj) => {
      setSelectedClient(clientObj);
      setClients([]);
      setStep(3); 
  };

  const handleCreateNewLead = async () => {
      setIsAddingLead(true);
      try {
          const isNewClient = selections.callerType === 'New Client';

          const newClientData = { 
              full_name: newLeadForm.name, 
              email: newLeadForm.email, 
              phone: newLeadForm.phone,
              status: isNewClient ? 'Active' : 'Lead' 
          };

          const { data } = await supabase.from('clients').insert(newClientData).select().single();
          const attachedClient = data || { id: null, ...newClientData };

          await fetch(WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                  source: "support_console_lead_capture",
                  actionKey: isNewClient ? "New Client Registration" : "Potential Client Lead",
                  fullName: newClientData.full_name, 
                  email: newClientData.email, 
                  phone: newClientData.phone
              })
          });

          handleAttachClient(attachedClient);
      } catch (err) {
          console.error("Error creating lead/client:", err);
          handleAttachClient({ id: null, full_name: newLeadForm.name, email: newLeadForm.email, phone: newLeadForm.phone });
      } finally {
          setIsAddingLead(false);
      }
  };

  const handleActionClick = async (actionName) => {
      setActionLoading(prev => ({ ...prev, [actionName]: true }));
      try {
          // 👇 Central Webhook with explicit 'actionKey' identifier 👇
          await fetch(WEBHOOK_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                  source: "support_console_action",
                  actionKey: actionName, // e.g. "Send Payment Link", "Escalate to Sales", etc.
                  fullName: selectedClient?.full_name || "Unknown", 
                  email: selectedClient?.email || "", 
                  phone: selectedClient?.phone || "", 
                  clientId: selectedClient?.id || "Lead",
                  category: selections.category,
                  subIssue: selections.subIssue,
                  adminId: userId
              })
          });

          addToast({ title: "Triggered", message: `Successfully triggered: ${actionName}`, variant: "success", icon: "bi-check-circle-fill" });
      } catch (err) {
          console.error("Action Trigger Error:", err);
          addToast({ title: "Trigger Failed", message: `Failed to trigger: ${actionName}. Please try again.`, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      } finally {
          setActionLoading(prev => ({ ...prev, [actionName]: false }));
      }
  };

  const handleLogCall = async () => {
    setIsLogging(true);
    try {
        await supabase.from('support_call_logs').insert({
            admin_id: userId,
            client_id: selectedClient?.id || null, 
            caller_name: selectedClient?.full_name || "Unknown",
            caller_type: selections.callerType,
            category: selections.category,
            sub_issue: selections.subIssue,
            created_at: new Date().toISOString()
        });

        await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                source: "support_console_post_call",
                actionKey: "Send Post Call Survey",
                email: selectedClient?.email || "", 
                fullName: selectedClient?.full_name || "Lead", 
                phone: selectedClient?.phone || "", 
                issue: selections.subIssue 
            })
        });

        setCallLogged(true);
        setTimeout(() => resetConsole(), 2500);
    } catch (err) {
        console.error("Error logging call:", err);
        addToast({ title: "Log Failed", message: "Failed to log call to database.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setIsLogging(false);
    }
  };

  // --- DERIVED DATA ---
  const currentChecks = REQUIRED_CHECKS[selections.subIssue] || ['Open Account', 'Verify Identity']; 
  const allChecksComplete = completedChecks.length === currentChecks.length;
  const currentResponse = SCRIPTS_AND_ACTIONS[selections.subIssue] || {
      confidence: 'yellow',
      script: "System script not found for this sub-issue. Please exercise judgment or escalate.",
      actions: ['Schedule Callback', 'Escalate to Supervisor']
  };

  return (
    <Container fluid className="py-4 bg-transparent" style={{ minHeight: "100vh", maxWidth: "1400px" }}>
      
      <div className="d-flex justify-content-between align-items-center mb-4 border-bottom border-secondary pb-3">
        <div>
          <h2 className="fw-bold text-white mb-0"><i className="bi bi-headset text-primary me-2"></i> Support Console</h2>
          <p className="text-muted small mb-0">Child-proof call routing and resolution engine.</p>
        </div>
        <Button variant="outline-danger" size="sm" onClick={resetConsole}><i className="bi bi-arrow-counterclockwise me-1"></i> Reset Call</Button>
      </div>

      <Row className="g-4">
        <Col lg={4}>
          <RoutingSidebar 
            step={step} 
            selections={selections} 
            handleSelect={handleSelect}
            searchQuery={searchQuery}
            searchClients={searchClients}
            clients={clients}
            selectedClient={selectedClient}
            handleAttachClient={handleAttachClient}
            newLeadForm={newLeadForm}
            setNewLeadForm={setNewLeadForm}
            isAddingLead={isAddingLead}
            handleCreateNewLead={handleCreateNewLead}
            handleGoBack={handleGoBack}
          />
        </Col>

        <Col lg={8}>
          <ResolutionWorkspace 
            step={step}
            selectedClient={selectedClient}
            currentChecks={currentChecks}
            completedChecks={completedChecks}
            toggleCheck={toggleCheck}
            allChecksComplete={allChecksComplete}
            currentResponse={currentResponse}
            isLogging={isLogging}
            callLogged={callLogged}
            handleLogCall={handleLogCall}
            handleActionClick={handleActionClick} 
            actionLoading={actionLoading}         
          />
        </Col>
      </Row>
    </Container>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function RoutingSidebar({ step, selections, handleSelect, searchQuery, searchClients, clients, selectedClient, handleAttachClient, newLeadForm, setNewLeadForm, isAddingLead, handleCreateNewLead, handleGoBack }) {
  return (
    <Card className="bg-dark border-secondary shadow-sm h-100">
      <Card.Header className="bg-black border-secondary py-3">
        <h6 className="fw-bold text-white mb-0 text-uppercase tracking-wider">Call Routing Path</h6>
      </Card.Header>
      <Card.Body className="p-0">
        <div className="list-group list-group-flush bg-transparent">
          
          <div className={`list-group-item bg-transparent border-secondary p-4 ${step === 1 ? 'bg-primary bg-opacity-10' : ''}`}>
            <h6 className={`fw-bold ${step === 1 ? 'text-primary' : 'text-white'}`}>1. Identify Caller</h6>
            {step === 1 ? (
              <div className="d-flex flex-wrap gap-2 mt-3 animate-fade-in">
                {CALLER_TYPES.map(type => (
                  <Button key={type} variant="outline-light" size="sm" className="fw-bold" onClick={() => handleSelect('callerType', type)}>{type}</Button>
                ))}
              </div>
            ) : (
              <div className="d-flex justify-content-between align-items-center mt-2 animate-fade-in">
                  <div className="text-primary fw-bold"><i className="bi bi-check-circle-fill me-2"></i>{selections.callerType}</div>
                  <Button variant="link" size="sm" className="text-muted p-0" onClick={() => handleGoBack(1)}><i className="bi bi-pencil-square fs-6"></i></Button>
              </div>
            )}
          </div>

          <div className={`list-group-item bg-transparent border-secondary p-4 ${step === 2 ? 'bg-primary bg-opacity-10' : ''}`} style={{ opacity: step >= 2 ? 1 : 0.4 }}>
            <h6 className={`fw-bold ${step === 2 ? 'text-primary' : 'text-white'}`}>2. Attach Profile</h6>
            {step === 2 && selections.callerType && (
              <div className="mt-3 animate-fade-in">
                  {selections.callerType === 'Current Client' || selections.callerType === 'Partner' ? (
                      <div className="position-relative">
                          <Form.Control 
                              type="text" 
                              placeholder={`Search ${selections.callerType} Database...`}
                              value={searchQuery}
                              onChange={(e) => searchClients(e.target.value)}
                              className="bg-black text-white border-secondary mb-2"
                          />
                          {clients.length > 0 && (
                              <div className="position-absolute w-100 bg-dark border border-secondary rounded shadow z-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                  {clients.map(c => (
                                      <div key={c.id} className="p-2 border-bottom border-secondary text-white cursor-pointer hover-bg-secondary" onClick={() => handleAttachClient(c)}>
                                          <div className="fw-bold">{c.full_name}</div>
                                          <div className="small text-muted">{c.email}</div>
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  ) : (
                      <div className="d-flex flex-column gap-2">
                          <Form.Control 
                              type="text" placeholder="Caller's Full Name *" 
                              value={newLeadForm.name} onChange={(e) => setNewLeadForm({...newLeadForm, name: e.target.value})}
                              className="bg-black text-white border-secondary"
                          />
                          <Form.Control 
                              type="email" placeholder="Email Address" 
                              value={newLeadForm.email} onChange={(e) => setNewLeadForm({...newLeadForm, email: e.target.value})}
                              className="bg-black text-white border-secondary"
                          />
                          <Form.Control 
                              type="text" placeholder="Phone Number" 
                              value={newLeadForm.phone} onChange={(e) => setNewLeadForm({...newLeadForm, phone: e.target.value})}
                              className="bg-black text-white border-secondary"
                          />
                          <Button variant="primary" className="fw-bold mt-2" disabled={!newLeadForm.name || isAddingLead} onClick={handleCreateNewLead}>
                              {isAddingLead ? <Spinner size="sm" /> : "Create Lead & Continue"}
                          </Button>
                      </div>
                  )}
              </div>
            )}
            {step > 2 && selectedClient && (
              <div className="d-flex justify-content-between align-items-center mt-2 animate-fade-in">
                  <div className="text-primary fw-bold"><i className="bi bi-person-check-fill me-2"></i>{selectedClient.full_name}</div>
                  <Button variant="link" size="sm" className="text-muted p-0" onClick={() => handleGoBack(2)}><i className="bi bi-pencil-square fs-6"></i></Button>
              </div>
            )}
          </div>

          <div className={`list-group-item bg-transparent border-secondary p-4 ${step === 3 ? 'bg-primary bg-opacity-10' : ''}`} style={{ opacity: step >= 3 ? 1 : 0.4 }}>
            <h6 className={`fw-bold ${step === 3 ? 'text-primary' : 'text-white'}`}>3. Issue Category</h6>
            {step === 3 ? (
              <div className="d-flex flex-wrap gap-2 mt-3 animate-fade-in">
                {(CATEGORIES[selections.callerType] || []).map(cat => (
                  <Button key={cat} variant="outline-light" size="sm" className="fw-bold" onClick={() => handleSelect('category', cat)}>{cat}</Button>
                ))}
              </div>
            ) : step > 3 ? (
              <div className="d-flex justify-content-between align-items-center mt-2 animate-fade-in">
                  <div className="text-primary fw-bold"><i className="bi bi-check-circle-fill me-2"></i>{selections.category}</div>
                  <Button variant="link" size="sm" className="text-muted p-0" onClick={() => handleGoBack(3)}><i className="bi bi-pencil-square fs-6"></i></Button>
              </div>
            ) : null}
          </div>

          <div className={`list-group-item bg-transparent border-secondary p-4 ${step === 4 ? 'bg-primary bg-opacity-10' : ''}`} style={{ opacity: step >= 4 ? 1 : 0.4 }}>
            <h6 className={`fw-bold ${step === 4 ? 'text-primary' : 'text-white'}`}>4. Specific Sub-Issue</h6>
            {step === 4 ? (
              <div className="d-flex flex-wrap gap-2 mt-3 animate-fade-in">
                {(SUB_ISSUES[selections.category] || ['Other (Escalate)']).map(sub => (
                  <Button key={sub} variant="outline-info" size="sm" className="fw-bold text-dark" onClick={() => handleSelect('subIssue', sub)}>{sub}</Button>
                ))}
              </div>
            ) : step > 4 ? (
              <div className="d-flex justify-content-between align-items-center mt-2 animate-fade-in">
                  <div className="text-info fw-bold"><i className="bi bi-check-circle-fill me-2"></i>{selections.subIssue}</div>
                  <Button variant="link" size="sm" className="text-muted p-0" onClick={() => handleGoBack(4)}><i className="bi bi-pencil-square fs-6"></i></Button>
              </div>
            ) : null}
          </div>

        </div>
      </Card.Body>
    </Card>
  );
}

function ResolutionWorkspace({ step, selectedClient, currentChecks, completedChecks, toggleCheck, allChecksComplete, currentResponse, isLogging, callLogged, handleLogCall, handleActionClick, actionLoading }) {
  if (step !== 5) {
    return (
      <div className="h-100 d-flex flex-column justify-content-center align-items-center text-muted opacity-50 border border-secondary border-dashed rounded-3 p-5">
        <i className="bi bi-headset display-1 mb-3"></i>
        <h4 className="fw-bold">Awaiting Call Routing</h4>
        <p>Follow the routing path on the left to generate resolution protocols.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in d-flex flex-column h-100 gap-3">
      {/* REQUIRED CHECKS PANEL */}
      <Card className={`border-2 shadow-sm ${allChecksComplete ? 'border-success bg-dark' : 'border-warning bg-black'}`}>
        <Card.Header className={`py-3 d-flex justify-content-between align-items-center ${allChecksComplete ? 'bg-success bg-opacity-25' : 'bg-warning bg-opacity-25'}`}>
          <h5 className={`fw-bold mb-0 ${allChecksComplete ? 'text-success' : 'text-warning'}`}>
            <i className={`bi ${allChecksComplete ? 'bi-check-all' : 'bi-exclamation-triangle-fill'} me-2`}></i>
            {allChecksComplete ? 'All Checks Complete' : 'Required Verification Checks'}
          </h5>
          <Badge bg={allChecksComplete ? "success" : "warning"} text="dark">
            {completedChecks.length} / {currentChecks.length}
          </Badge>
        </Card.Header>
        <Card.Body className="p-4">
          <p className="text-muted small mb-4">You MUST verify the following information for <strong className="text-white">{selectedClient?.full_name}</strong> before providing an answer.</p>
          
          <div className="d-flex flex-column gap-3">
            {currentChecks.map((check, idx) => {
              const isChecked = completedChecks.includes(idx);
              return (
                <div 
                  key={idx} 
                  className={`px-4 py-3 rounded border cursor-pointer transition-all d-flex align-items-center gap-3 ${isChecked ? 'bg-success bg-opacity-10 border-success' : 'bg-dark border-secondary'}`}
                  onClick={() => toggleCheck(idx)}
                >
                  <input type="checkbox" className="m-0 flex-shrink-0 cursor-pointer" checked={isChecked} readOnly style={{ width: '1.5rem', height: '1.5rem' }} />
                  <span className={`fw-bold mb-0 ${isChecked ? 'text-success' : 'text-light'}`} style={{ fontSize: '1.1rem' }}>{check}</span>
                </div>
              )
            })}
          </div>

          <ProgressBar now={(completedChecks.length / currentChecks.length) * 100} variant={allChecksComplete ? "success" : "warning"} className="mt-4 bg-dark" style={{ height: '5px' }} />
        </Card.Body>
      </Card>

      {/* SCRIPT & ACTION PANEL */}
      <Card className={`border-0 shadow-lg flex-grow-1 transition-all ${allChecksComplete ? 'bg-dark' : 'bg-black opacity-50'}`} style={{ filter: allChecksComplete ? 'none' : 'blur(4px)', pointerEvents: allChecksComplete ? 'auto' : 'none' }}>
        <Card.Header className="bg-black py-3 d-flex justify-content-between align-items-center">
          <h5 className="fw-bold text-white mb-0"><i className="bi bi-chat-quote text-info me-2"></i> Resolution Script</h5>
          {allChecksComplete && (
            <Badge bg={currentResponse.confidence === 'green' ? 'success' : currentResponse.confidence === 'yellow' ? 'warning' : 'danger'} className="text-uppercase px-3 py-2 text-dark">
               Confidence: {currentResponse.confidence}
            </Badge>
          )}
        </Card.Header>
        <Card.Body className="p-4 p-md-5 d-flex flex-column">
          <div className="bg-light text-dark p-4 rounded-3 mb-4 font-monospace fs-5 border border-3 border-info shadow-sm" style={{ whiteSpace: 'pre-wrap' }}>
            {currentResponse.script}
          </div>

          <h6 className="fw-bold text-muted text-uppercase mb-3 mt-auto">Required Action</h6>
          <div className="d-flex flex-wrap gap-3 mb-4">
            {currentResponse.actions.map(action => {
               const isLoading = actionLoading[action];
               return (
                 <Button 
                    key={action} 
                    variant={action.includes('Escalate') ? "danger" : "outline-info"} 
                    className="fw-bold px-4 py-2"
                    onClick={() => handleActionClick(action)}
                    disabled={isLoading}
                 >
                   {isLoading ? <Spinner size="sm" className="me-2" /> : null}
                   {action}
                 </Button>
               )
            })}
          </div>

          <div className="border-top border-secondary pt-4 mt-2 d-flex justify-content-between align-items-center">
            <div className="text-muted small">
              Did you ask: <em>"Have I answered your question today?"</em>
            </div>
            <Button 
              variant={callLogged ? "success" : "primary"} 
              size="lg" 
              className="fw-bold shadow-sm px-5"
              onClick={handleLogCall}
              disabled={isLogging || callLogged}
            >
              {isLogging ? <Spinner size="sm" /> : callLogged ? <><i className="bi bi-check-lg me-2"></i> Logged</> : "Log Call & Send Survey"}
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}