import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompanyAuth } from '../../context/CompanyAuthContext';
import { supabase } from '../../supabaseClient'; 
import { 
  Container, Card, Nav, Tab, Spinner, Alert, Button, 
  Stack, Row, Col, Badge, Offcanvas, ListGroup, Modal, Navbar
} from 'react-bootstrap';

// Sub-components
import DashboardOverview from './DashboardOverview';
import ServiceClientList from './ServiceClientList';
import InquiryRemovalClientList from './InquiryRemovalClientList';
import NewLeadsList from './NewLeadsList';
import AddClientModal from './AddClientModal';
import AddAgentModal from './AddAgentModal';
import FunderEligibilityModal from '../shared/ui/FunderEligibilityModal'; 
import ClientSummaryModal from '../admin/client-profile/modals/ClientSummaryModal';
import QuickEligibilityChecker from "../shared/ui/QuickEligibilityChecker";
import CompanyVisionBoard from './CompanyVisionBoard';
import ClientReportPage from '../shared/client-pages/ClientReportPage';
import CompanySettingsPanel from './CompanySettingsPanel';
import SupportChatLauncher from '../shared/support/SupportChatLauncher';

// --- HELPER: Standardize empty/unassigned agents ---
const standardizeAgentName = (name) => {
  if (!name) return "N/A";
  const lowerName = name.trim().toLowerCase();
  if (["n/a", "na", "-", "—", "unassigned", "null", ""].includes(lowerName)) {
    return "N/A";
  }
  return name.trim();
};

const STAGE_TITLES = {
  awaitingPayment: "New / Unpaid Clients",
  awaitingDocs: "Awaiting Documents",
  pendingReview: "Pending Review",
  processing: "Active Processing",
  completed: "Fully Completed",
  eligible: "Funding Eligible Clients"
};

const CompanyPortalDashboard = () => {
  // 👇 Pulled companyName so we can pass it to the Timeline for Dennis 👇
  const { user, loading, error, isCompanyAdmin, isAgent, companyId, companyName, companyLogoUrl, fullName, signOut } = useCompanyAuth();
  const navigate = useNavigate();

  // Layout State
  const [currentView, setCurrentView] = useState('overview');
  // Support Chat is an overlay (SupportChatLauncher), not a page — a
  // separate currentView === 'support' would navigate away from whatever
  // an agent was doing, defeating the point of an overlay that's supposed
  // to sit on top of the current page.
  const [supportChatOpen, setSupportChatOpen] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [dashboardError, setDashboardError] = useState(null);

  // Modals & Tabs State
  const [showAddAgentModal, setShowAddAgentModal] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [eligibilityClient, setEligibilityClient] = useState(null);
  
  const [showQuickCheckerModal, setShowQuickCheckerModal] = useState(false);
  const [showCreditAnalysisModal, setShowCreditAnalysisModal] = useState(false);
  
  const [showSummary, setShowSummary] = useState(false);
  const [summaryClient, setSummaryClient] = useState(null);

  const [companySubStatus, setCompanySubStatus] = useState({ 
    checksCount: 0, checksLimit: 2, 
    analysisCount: 0, analysisLimit: 2, 
    plan: 'FREE_TRIAL' 
  });
  const [showPaywallModal, setShowPaywallModal] = useState(false);

  const [activeClientTab, setActiveClientTab] = useState('inquiry_removal');
  const [refreshKey, setRefreshKey] = useState(0); 

  // Pipeline Drawer State
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerStage, setDrawerStage] = useState(null); 

  // Global Data State
  const [pipelineData, setPipelineData] = useState({
      awaitingPayment: [], awaitingDocs: [], pendingReview: [], processing: [], completed: [], eligible: []
  });

  const theme = {
    bgMain: "#0B1121",
    bgCard: "#131b2f",
    border: "#1e293b",
    textMain: "#f8fafc",
    textMuted: "#94a3b8",
  };

  useEffect(() => {
    if (!companyId) return;

    const fetchDashboardMeta = async () => {
      try {
        setDashboardError(null);

        const { data: coData } = await supabase
            .from('companies')
            .select('eligibility_checks_count, eligibility_checks_limit, credit_analysis_count, credit_analysis_limit, subscription_plan')
            .eq('id', companyId)
            .single();

        if (coData) {
            setCompanySubStatus({
                checksCount: coData.eligibility_checks_count || 0,
                checksLimit: coData.eligibility_checks_limit ?? 2,
                analysisCount: coData.credit_analysis_count || 0,
                analysisLimit: coData.credit_analysis_limit ?? 2,
                plan: coData.subscription_plan || 'FREE_TRIAL'
            });
        }

        const { data: agentRes } = await supabase
            .from('company_user_profiles') 
            .select('id, full_name')
            .eq('company_id', companyId)
            .in('role', ['agent', 'company_agent']); 

        const agentLookupMap = {};
        if (agentRes) agentRes.forEach(a => { agentLookupMap[a.id] = a.full_name; });

        let query = supabase
            .from('clients')
            .select(`
                id, full_name, is_paid, paid_at, created_at, updated_at, funding_status, progress, 
                exp_completed, tu_completed, eq_completed, agent, agent_id, 
                is_uploaded, tu_eq_docs_submitted_at, is_paused, dispute_method, counter, start_inquiries,
                company_tasks(is_completed),
                client_documents(id, file_name) 
            `)
            .eq('company_id', companyId)
            .limit(9999);

        if (isAgent && user?.id) query = query.eq('agent_id', user.id);

        const { data: clientData, error: clientErr } = await query;
        
        if (clientErr) {
            console.error("Dashboard Fetch Error:", clientErr);
            setDashboardError(`Failed to load client data: ${clientErr.message}`);
            return;
        }

        if (!clientData || clientData.length === 0) return;

        // 👇 UPDATED: FETCH CALL LOGS SEPARATELY (Replaced comments table) 👇
        const clientIds = clientData.map(c => c.id);
        const clientsWithCalls = new Set();
        
        const chunkSize = 150;
        for (let i = 0; i < clientIds.length; i += chunkSize) {
            const chunk = clientIds.slice(i, i + chunkSize);
            const { data: callsChunk, error: callErr } = await supabase
                .from('call_logs') // 👈 Now strictly queries call_logs
                .select('client_id')
                .in('client_id', chunk);
                
            if (callsChunk && !callErr) {
                callsChunk.forEach(c => clientsWithCalls.add(c.client_id));
            }
        }

        const pipeline = { awaitingPayment: [], awaitingDocs: [], pendingReview: [], processing: [], completed: [], eligible: [] };

        // DISTRIBUTE THE PIPELINE
        clientData.forEach(rawClient => {
            const pScore = Math.round(Number(rawClient.progress || 0) * 100);
            const rawAgentName = rawClient.agent || agentLookupMap[rawClient.agent_id] || "N/A";
            
            const uploadedDocTypes = rawClient.client_documents ? rawClient.client_documents.map(d => d.file_name) : [];
            const hasAllRequiredDocs = ['license', 'ssn', 'poa'].every(doc => uploadedDocTypes.includes(doc));
            
            const hasDocs = hasAllRequiredDocs || !!rawClient.is_uploaded || !!rawClient.tu_eq_docs_submitted_at;
            const hasCalls = clientsWithCalls.has(rawClient.id); // 👈 Replaced hasComments
            const allDone = (rawClient.exp_completed && rawClient.tu_completed && rawClient.eq_completed) || pScore >= 100;

            const client = { 
              ...rawClient, 
              pScore,
              hasDocs,
              hasCalls, // 👈 Pushed to pipeline object
              allDone,
              agentName: standardizeAgentName(rawAgentName)
            };

            // UNBREAKABLE 5-STEP PIPELINE LOGIC
            if (!client.is_paid) {
                client.opStage = 'awaitingPayment';
                pipeline.awaitingPayment.push(client);
            } else if (!hasDocs) {
                client.opStage = 'awaitingDocs';
                pipeline.awaitingDocs.push(client);
            } else if (allDone) {
                client.opStage = 'completed';
                pipeline.completed.push(client);
            } else if (!hasCalls) { // 👈 Gate 4 now strictly checks for Call Logs
                client.opStage = 'pendingReview';
                pipeline.pendingReview.push(client);
            } else { // 👈 Gate 5 triggers if a Call Log exists
                client.opStage = 'processing';
                pipeline.processing.push(client);
            }

            if (client.funding_status === 'GREEN') pipeline.eligible.push(client);
        });

        setPipelineData(pipeline);
      } catch (err) {
        console.error("Failed to load dashboard metadata", err);
        setDashboardError(`Unexpected error loading dashboard: ${err.message}`);
      }
    };

    fetchDashboardMeta();
  }, [companyId, refreshKey, isAgent, user?.id]);

  const handleOpenQuickChecker = () => {
      const { checksCount, checksLimit, plan } = companySubStatus;
      if (plan === 'UNLIMITED' || checksLimit === -1) return setShowQuickCheckerModal(true);
      if (checksCount >= checksLimit) return setShowPaywallModal(true);
      setShowQuickCheckerModal(true);
  };

  const handleFundingCheckExecuted = async () => {
      setCompanySubStatus(prev => ({ ...prev, checksCount: prev.checksCount + 1 }));
      await supabase.rpc('increment_company_check_count', { company_uuid: companyId });
  };

  const handleOpenCreditAnalysis = () => {
      const { analysisCount, analysisLimit, plan } = companySubStatus;
      if (plan === 'UNLIMITED' || analysisLimit === -1) return setShowCreditAnalysisModal(true);
      if (analysisCount >= analysisLimit) return setShowPaywallModal(true);
      setShowCreditAnalysisModal(true);
  };

  const handleAnalysisExecuted = async () => {
      setCompanySubStatus(prev => ({ ...prev, analysisCount: prev.analysisCount + 1 }));
      await supabase.rpc('increment_credit_analysis_count', { company_uuid: companyId });
  };

  const handleOpenEligibility = (client) => { setEligibilityClient(client); setShowEligibilityModal(true); };
  const handleOpenBlueprint = (clientId) => { window.open(`/blueprint/${clientId}`, '_blank'); };
  const handleOpenSummary = (client) => { setSummaryClient(client); setShowSummary(true); };
  const handleCloseSummary = () => { setShowSummary(false); setSummaryClient(null); };
  const openDrawer = (stage) => { setDrawerStage(stage); setShowDrawer(true); };

  const handleLogout = async () => {
      await signOut();
      navigate('/login', { replace: true });
  };

  if (loading) return <Container className="text-center mt-5"><Spinner animation="border" variant="info" /><p className="mt-2 text-muted">Loading Command Center...</p></Container>;
  if (error) return <Container className="mt-5"><Alert variant="danger">Error: {error}</Alert></Container>;
  if (!user) return null;

  const renderSidebarContent = () => (
    <div className="d-flex flex-column h-100 py-4 px-3" style={{ backgroundColor: '#0f172a' }}>
        <div className="d-flex align-items-center mb-4 px-2 pb-4 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.05) !important' }}>
            <div className="text-white rounded-circle d-flex align-items-center justify-content-center shadow-sm me-3 flex-shrink-0 overflow-hidden" style={{ width: '45px', height: '45px', backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={companyName ? `${companyName} logo` : "Company logo"}
                    className="w-100 h-100"
                    style={{ objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                ) : null}
                <i className="bi bi-person-fill fs-5" style={{ color: '#38bdf8', display: companyLogoUrl ? 'none' : 'flex' }}></i>
            </div>
            <div className="overflow-hidden">
                <h6 className="fw-bold text-white mb-0 text-truncate">
                    {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                </h6>
                <small className="text-capitalize text-truncate d-block" style={{ color: '#94a3b8' }}>{isCompanyAdmin ? 'Company Admin' : isAgent ? 'Agent' : 'Staff'}</small>
            </div>
        </div>

        <div className="fw-bold text-uppercase mb-2 px-3 font-monospace flex-shrink-0" style={{ fontSize: "0.65rem", letterSpacing: "1px", color: "#64748b" }}>Main Menu</div>
        <Nav className="flex-column gap-1 mb-4 flex-shrink-0">
            <Nav.Item>
                <div onClick={() => { setCurrentView('overview'); setShowMobileMenu(false); }} className={`d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer ${currentView === 'overview' ? 'text-white shadow-sm' : 'hover-bg-dark'}`} style={{ transition: 'all 0.2s', fontWeight: currentView === 'overview' ? '700' : '500', backgroundColor: currentView === 'overview' ? '#1e293b' : 'transparent', color: currentView === 'overview' ? '#ffffff' : '#94a3b8' }}>
                    <i className="bi bi-grid-1x2-fill me-3 fs-5" style={{ color: currentView === 'overview' ? '#38bdf8' : '#64748b' }}></i> Overview
                </div>
            </Nav.Item>
            <Nav.Item>
                <div onClick={() => { setCurrentView('clients'); setShowMobileMenu(false); }} className={`d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer ${currentView === 'clients' ? 'text-white shadow-sm' : 'hover-bg-dark'}`} style={{ transition: 'all 0.2s', fontWeight: currentView === 'clients' ? '700' : '500', backgroundColor: currentView === 'clients' ? '#1e293b' : 'transparent', color: currentView === 'clients' ? '#ffffff' : '#94a3b8' }}>
                    <i className="bi bi-people-fill me-3 fs-5" style={{ color: currentView === 'clients' ? '#38bdf8' : '#64748b' }}></i> Client Management
                </div>
            </Nav.Item>
            <Nav.Item>
                <div onClick={() => { setCurrentView('new_leads'); setShowMobileMenu(false); }} className={`d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer ${currentView === 'new_leads' ? 'text-white shadow-sm' : 'hover-bg-dark'}`} style={{ transition: 'all 0.2s', fontWeight: currentView === 'new_leads' ? '700' : '500', backgroundColor: currentView === 'new_leads' ? '#1e293b' : 'transparent', color: currentView === 'new_leads' ? '#ffffff' : '#94a3b8' }}>
                    <i className="bi bi-person-plus-fill me-3 fs-5" style={{ color: currentView === 'new_leads' ? '#38bdf8' : '#64748b' }}></i> New Leads
                </div>
            </Nav.Item>
            <Nav.Item>
                <div onClick={() => { setCurrentView('vision_board'); setShowMobileMenu(false); }} className={`d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer ${currentView === 'vision_board' ? 'text-white shadow-sm' : 'hover-bg-dark'}`} style={{ transition: 'all 0.2s', fontWeight: currentView === 'vision_board' ? '700' : '500', backgroundColor: currentView === 'vision_board' ? '#1e293b' : 'transparent', color: currentView === 'vision_board' ? '#ffffff' : '#94a3b8' }}>
                    <i className="bi bi-stars me-3 fs-5" style={{ color: currentView === 'vision_board' ? '#38bdf8' : '#64748b' }}></i> Vision Board
                </div>
            </Nav.Item>
            <Nav.Item>
                <div onClick={() => { setSupportChatOpen(true); setShowMobileMenu(false); }} className={`d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer ${supportChatOpen ? 'text-white shadow-sm' : 'hover-bg-dark'}`} style={{ transition: 'all 0.2s', fontWeight: supportChatOpen ? '700' : '500', backgroundColor: supportChatOpen ? '#1e293b' : 'transparent', color: supportChatOpen ? '#ffffff' : '#94a3b8' }}>
                    <i className="bi bi-chat-dots-fill me-3 fs-5" style={{ color: supportChatOpen ? '#38bdf8' : '#64748b' }}></i> Support Chat
                </div>
            </Nav.Item>

            {isCompanyAdmin && (
              <Nav.Item>
                  <div onClick={() => { setCurrentView('settings'); setShowMobileMenu(false); }} className={`d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer ${currentView === 'settings' ? 'text-white shadow-sm' : 'hover-bg-dark'}`} style={{ transition: 'all 0.2s', fontWeight: currentView === 'settings' ? '700' : '500', backgroundColor: currentView === 'settings' ? '#1e293b' : 'transparent', color: currentView === 'settings' ? '#ffffff' : '#94a3b8' }}>
                      <i className="bi bi-gear-fill me-3 fs-5" style={{ color: currentView === 'settings' ? '#38bdf8' : '#64748b' }}></i> Company Settings
                  </div>
              </Nav.Item>
            )}
        </Nav>

        <div className="fw-bold text-uppercase mb-2 px-3 mt-4 font-monospace flex-shrink-0" style={{ fontSize: "0.65rem", letterSpacing: "1px", color: "#64748b" }}>Quick Tools</div>
        <Nav className="flex-column gap-1 mb-auto overflow-hidden">
            <Nav.Item>
                <div onClick={handleOpenQuickChecker} className="d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer hover-bg-dark" style={{ transition: 'all 0.2s', fontWeight: '500', color: '#94a3b8' }}>
                    <i className="bi bi-bank me-3 fs-5" style={{ color: '#fbbf24' }}></i> Funding Checker 
                    {companySubStatus.plan === 'UNLIMITED' || companySubStatus.checksLimit === -1 ? (
                        <span className="ms-auto badge bg-success bg-opacity-25 text-success border border-success">Unlimited</span>
                    ) : (
                        <span className={`ms-auto badge ${companySubStatus.checksCount >= companySubStatus.checksLimit ? 'bg-danger bg-opacity-25 text-danger border border-danger' : 'bg-secondary bg-opacity-25 text-secondary border border-secondary'}`}>
                            {companySubStatus.checksCount >= companySubStatus.checksLimit ? 'Limit Reached' : `${companySubStatus.checksCount}/${companySubStatus.checksLimit} Used`}
                        </span>
                    )}
                </div>
            </Nav.Item>
            <Nav.Item>
                <div onClick={handleOpenCreditAnalysis} className="d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer hover-bg-dark" style={{ transition: 'all 0.2s', fontWeight: '500', color: '#94a3b8' }}>
                    <i className="bi bi-file-earmark-bar-graph me-3 fs-5" style={{ color: '#38bdf8' }}></i> Credit Analysis 
                    {companySubStatus.plan === 'UNLIMITED' || companySubStatus.analysisLimit === -1 ? (
                        <span className="ms-auto badge bg-success bg-opacity-25 text-success border border-success">Unlimited</span>
                    ) : (
                        <span className={`ms-auto badge ${companySubStatus.analysisCount >= companySubStatus.analysisLimit ? 'bg-danger bg-opacity-25 text-danger border border-danger' : 'bg-secondary bg-opacity-25 text-secondary border border-secondary'}`}>
                            {companySubStatus.analysisCount >= companySubStatus.analysisLimit ? 'Limit Reached' : `${companySubStatus.analysisCount}/${companySubStatus.analysisLimit} Used`}
                        </span>
                    )}
                </div>
            </Nav.Item>
        </Nav>

        <div className="mt-4 pt-3 border-top flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.05) !important' }}>
            {/* Previously only reachable via the now-deleted CompanyPortalNavibar.jsx
                (dead, unused component) — this dashboard shell never had its own
                link to the routed /profile page (password change, name edit), so
                it was unreachable from the actual UI. */}
            <div onClick={() => navigate(`/company-portal/${companyId}/profile`)} className="d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer hover-bg-dark" style={{ transition: 'all 0.2s', fontWeight: '500', color: '#94a3b8' }}>
                <i className="bi bi-person-gear me-3 fs-5"></i> Edit Profile
            </div>
            <div onClick={handleLogout} className="d-flex align-items-center rounded-3 p-2 px-3 cursor-pointer" style={{ transition: 'all 0.2s', fontWeight: '500', color: '#f87171' }}>
                <i className="bi bi-box-arrow-right me-3 fs-5"></i> Sign Out
            </div>
        </div>
    </div>
  );

  return (
    <div className="d-flex w-100" style={{ backgroundColor: theme.bgMain, height: '100vh', overflow: 'hidden' }}>
      <div className="portal-sidebar d-none d-lg-flex flex-column shadow-lg">
          {renderSidebarContent()}
      </div>

      <Offcanvas show={showMobileMenu} onHide={() => setShowMobileMenu(false)} className="border-0" style={{ width: "280px", backgroundColor: '#0f172a' }}>
        {renderSidebarContent()}
      </Offcanvas>

      <div className="portal-main">
        <Navbar className="px-3 px-md-4 py-2 py-md-3 flex-shrink-0 d-flex justify-content-between align-items-center" style={{ backgroundColor: theme.bgMain, borderBottom: `1px solid ${theme.border}`, zIndex: 10 }}>
            <div className="d-flex align-items-center">
                <Button variant="link" className="d-lg-none p-0 me-3" style={{ color: '#e2e8f0' }} onClick={() => setShowMobileMenu(true)}>
                    <i className="bi bi-list fs-2"></i>
                </Button>
                <div className="d-flex align-items-center gap-3">
                  <h4 className="fw-bold mb-0 d-none d-sm-block text-white" style={{ letterSpacing: '0.5px' }}>Command Center</h4>
                  <Badge bg="dark" className="d-none d-xl-block fw-medium border" style={{ borderColor: theme.border, color: theme.textMuted }}>
                      Welcome, {user?.user_metadata?.full_name?.split(' ')[0] || 'Partner'}
                  </Badge>
                </div>
            </div>

            <Stack direction="horizontal" gap={3} className="align-items-center">
                <div className="d-none d-xl-flex gap-3">
                    <Button className="cmd-btn d-flex flex-column align-items-start justify-content-center px-3 py-1 rounded-3">
                        <div className="fw-bold" style={{ fontSize: '0.85rem' }}><i className="bi bi-lightning-charge-fill text-warning me-2"></i>Fast Inquiry Count</div>
                        <small style={{ fontSize: '0.6rem', color: theme.textMuted }}>Click for details</small>
                    </Button>
                    <Button className="cmd-btn d-flex align-items-center fw-bold px-3 py-2 rounded-3" onClick={handleOpenQuickChecker}>
                        <i className="bi bi-bank text-warning me-2"></i> Quick Check
                    </Button>
                </div>
                
                {isCompanyAdmin && (
                  <Button className="cmd-btn d-none d-md-flex align-items-center fw-bold px-3 py-2 rounded-3" onClick={() => setShowAddAgentModal(true)}>
                    Add Agent
                  </Button>
                )}

                <Button className="fw-bold d-flex align-items-center shadow-sm px-3 px-md-4 py-2 border-0 text-dark rounded-3 hover-lift" style={{ backgroundColor: '#fbbf24' }} onClick={() => setShowAddClientModal(true)}>
                  <i className="bi bi-plus-lg me-md-2"></i> <span className="d-none d-md-inline">New Client</span>
                </Button>
            </Stack>
        </Navbar>

        <div className="p-3 flex-grow-1 d-flex flex-column min-vh-0 overflow-hidden">
            {dashboardError && (
                <Alert variant="danger" className="mx-3 mt-3 fw-bold shadow-sm border-danger">
                    <i className="bi bi-exclamation-octagon-fill me-2"></i>
                    {dashboardError}
                </Alert>
            )}

            {currentView === 'overview' && !dashboardError && (
                <div className="animate-fade-in h-100 overflow-auto custom-scrollbar">
                    <DashboardOverview pipelineData={pipelineData} openDrawer={openDrawer} handleOpenSummary={handleOpenSummary} />
                </div>
            )}

            {currentView === 'clients' && (
                <div className="animate-fade-in h-100 d-flex flex-column">
                    <Card className="glass-panel overflow-hidden flex-grow-1 d-flex flex-column min-vh-0">
                      <Card.Header className="pt-3 px-4 d-flex flex-column flex-sm-row justify-content-between align-items-sm-center border-bottom gap-3 flex-shrink-0" style={{ backgroundColor: '#1e293b', borderColor: '#334155 !important' }}>
                        <Nav variant="pills" className="dark-tabs w-100 flex-wrap">
                          <Nav.Item><Nav.Link eventKey="inquiry_removal" active={activeClientTab === 'inquiry_removal'} onClick={() => setActiveClientTab('inquiry_removal')}>Inquiry Processing</Nav.Link></Nav.Item>
                          <Nav.Item><Nav.Link eventKey="credit_repair" active={activeClientTab === 'credit_repair'} onClick={() => setActiveClientTab('credit_repair')}>Credit File Prep</Nav.Link></Nav.Item>
                          <Nav.Item><Nav.Link eventKey="fraud_alert_removal" active={activeClientTab === 'fraud_alert_removal'} onClick={() => setActiveClientTab('fraud_alert_removal')}>Fraud Alert Removal</Nav.Link></Nav.Item>
                          <Nav.Item><Nav.Link eventKey="personal_identifiers" active={activeClientTab === 'personal_identifiers'} onClick={() => setActiveClientTab('personal_identifiers')}>Personal Identifiers</Nav.Link></Nav.Item>
                        </Nav>
                      </Card.Header>
                      <Card.Body className="p-0 overflow-auto custom-scrollbar flex-grow-1" style={{ backgroundColor: '#0f172a' }}>
                        <Tab.Container activeKey={activeClientTab}>
                            <Tab.Content>
                              <Tab.Pane eventKey="inquiry_removal">
                                <div className="p-3 p-md-4"><InquiryRemovalClientList refreshKey={refreshKey} onCheckEligibility={handleOpenEligibility} /></div>
                              </Tab.Pane>
                              <Tab.Pane eventKey="credit_repair">
                                <div className="p-3 p-md-4"><ServiceClientList serviceId="credit_repair" refreshKey={refreshKey} onCheckEligibility={handleOpenEligibility} /></div>
                              </Tab.Pane>
                              <Tab.Pane eventKey="fraud_alert_removal">
                                <div className="p-3 p-md-4"><ServiceClientList serviceId="fraud_alert_removal" refreshKey={refreshKey} onCheckEligibility={handleOpenEligibility} /></div>
                              </Tab.Pane>
                              <Tab.Pane eventKey="personal_identifiers">
                                <div className="p-3 p-md-4"><ServiceClientList serviceId="personal_identifiers" refreshKey={refreshKey} onCheckEligibility={handleOpenEligibility} /></div>
                              </Tab.Pane>
                            </Tab.Content>
                        </Tab.Container>
                      </Card.Body>
                    </Card>
                </div>
            )}

            {currentView === 'new_leads' && (
                <div className="animate-fade-in h-100 d-flex flex-column">
                    <Card className="glass-panel overflow-hidden flex-grow-1 d-flex flex-column min-vh-0">
                      <Card.Header className="pt-3 pb-3 px-4 flex-shrink-0" style={{ backgroundColor: '#1e293b', borderColor: '#334155 !important' }}>
                        <h5 className="fw-bold text-white mb-0"><i className="bi bi-person-plus-fill me-2" style={{ color: '#38bdf8' }}></i>New Leads</h5>
                      </Card.Header>
                      <Card.Body className="p-0 overflow-auto custom-scrollbar flex-grow-1" style={{ backgroundColor: '#0f172a' }}>
                        <div className="p-3 p-md-4"><NewLeadsList refreshKey={refreshKey} onMovedForward={() => setRefreshKey(prev => prev + 1)} /></div>
                      </Card.Body>
                    </Card>
                </div>
            )}

            {currentView === 'vision_board' && (
                <div className="animate-fade-in h-100 overflow-auto custom-scrollbar"><CompanyVisionBoard clientId={user?.id} onSubmitClient={() => setShowAddClientModal(true)} onViewTracker={() => setCurrentView('clients')} /></div>
            )}


            {currentView === 'settings' && isCompanyAdmin && (
                <div className="animate-fade-in h-100 overflow-auto custom-scrollbar"><CompanySettingsPanel companyId={companyId} /></div>
            )}
        </div>
      </div>
      
      {/* MODALS */}
      <AddAgentModal show={showAddAgentModal} handleClose={() => setShowAddAgentModal(false)} />
      <AddClientModal show={showAddClientModal} handleClose={() => setShowAddClientModal(false)} onClientAdded={() => setRefreshKey(prev => prev + 1)} />
      <FunderEligibilityModal show={showEligibilityModal} onHide={() => setShowEligibilityModal(false)} client={eligibilityClient} />
      
      {/* 👇 Passed companyName down into the Summary Modal for Dennis' rule! 👇 */}
      <ClientSummaryModal show={showSummary} onClose={handleCloseSummary} client={summaryClient} companyName={companyName} />

      <Modal show={showQuickCheckerModal} onHide={() => setShowQuickCheckerModal(false)} centered size="lg" contentClassName="bg-transparent border-0"><QuickEligibilityChecker onCheckCompleted={handleFundingCheckExecuted} companyId={companyId} /></Modal>
      <Modal show={showCreditAnalysisModal} onHide={() => setShowCreditAnalysisModal(false)} centered size="xl" contentClassName="bg-transparent border-0"><ClientReportPage onCheckCompleted={handleAnalysisExecuted} companyId={companyId} /></Modal>

      <Modal show={showPaywallModal} onHide={() => setShowPaywallModal(false)} centered size="md" contentClassName="border-0 shadow-lg" style={{ borderRadius: '16px', overflow: 'hidden' }}>
          <Modal.Header closeButton closeVariant="white" className="border-0 text-white" style={{ backgroundColor: '#0f172a' }}>
              <Modal.Title className="fw-bold"><i className="bi bi-shield-lock-fill me-2" style={{ color: '#fbbf24' }}></i> Upgrade Your Workspace</Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-4 text-center" style={{ backgroundColor: '#1e293b' }}>
              <div className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3 shadow-sm" style={{width: '60px', height: '60px', backgroundColor: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(251, 191, 36, 0.3)'}}>
                  <i className="bi bi-rocket-takeoff fs-2" style={{ color: '#fbbf24' }}></i>
              </div>
              <h5 className="fw-bold text-white mb-1">Tier Limit Reached</h5>
              <p className="small px-3 mb-4" style={{ color: '#94a3b8' }}>Your company profile has evaluated its available scans. Select a premium tier to scale system access across your entire agent network.</p>
              
              <Row className="g-3 mb-2">
                  <Col xs={12}>
                      <Card className="p-3 border-0 shadow-sm text-start rounded-3 hover-lift cursor-pointer" style={{ backgroundColor: '#0f172a', border: '1px solid #334155 !important' }}>
                          <div className="d-flex justify-content-between align-items-center">
                              <div><h6 className="fw-bold text-white mb-0">Professional Scaling Plan</h6><small style={{ color: '#94a3b8' }}>Includes 25 Audits, AI Analysis & Blueprints</small></div>
                              <div className="text-end"><h5 className="fw-bold mb-0" style={{ color: '#38bdf8' }}>$149</h5><small className="small" style={{ color: '#94a3b8' }}>/ month</small></div>
                          </div>
                      </Card>
                  </Col>
                  <Col xs={12}>
                      <Card className="p-3 border-0 shadow-sm text-start rounded-3 hover-lift cursor-pointer" style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' }}>
                          <div className="d-flex justify-content-between align-items-center">
                              <div><h6 className="fw-bold text-dark mb-0">Enterprise Unlimited</h6><small className="text-dark opacity-75">Infinite Scans & Full White-Label Tools</small></div>
                              <div className="text-end"><h5 className="fw-black text-dark mb-0">Custom</h5><small className="text-dark opacity-75 small">Contact Sales</small></div>
                          </div>
                      </Card>
                  </Col>
              </Row>
          </Modal.Body>
          <Modal.Footer className="border-0 pt-0" style={{ backgroundColor: '#1e293b' }}>
              <Button variant="outline-secondary" className="fw-bold w-100 py-2 border-0" style={{ color: '#94a3b8', backgroundColor: '#0f172a' }} onClick={() => setShowPaywallModal(false)}>Close Window</Button>
          </Modal.Footer>
      </Modal>

      <Offcanvas show={showDrawer} onHide={() => setShowDrawer(false)} placement="end" style={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(12px)', borderLeft: '1px solid #334155', width: '500px', maxWidth: '95vw' }} >
        <Offcanvas.Header closeButton closeVariant="white" className="border-0 pb-0 mt-3 px-4">
          <Offcanvas.Title className="fw-bold text-white fs-4"><i className="bi bi-funnel-fill me-2" style={{ color: '#38bdf8' }}></i>{drawerStage ? STAGE_TITLES[drawerStage] : 'Clients'}</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="mt-2 px-4 hide-scrollbar">
            <ListGroup variant="flush" className="gap-2">
                {drawerStage && pipelineData[drawerStage]?.map(client => (
                    <ListGroup.Item key={client.id} className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center p-3 rounded-3 shadow-sm gap-3" style={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}>
                        <div>
                            <div className="fw-bold text-white fs-6">
                                {client.full_name || 'Unnamed Client'}
                                {client.is_paused && <Badge bg="warning" text="dark" className="ms-2" style={{fontSize: '0.65rem'}}><i className="bi bi-pause-fill"></i> PAUSED</Badge>}
                            </div>
                            <div className="small text-muted mb-1"><i className="bi bi-person-badge me-1"></i>{client.agentName}</div>
                            
                            <div className="mt-2 d-flex flex-wrap gap-2">
                                {client.funding_status === 'GREEN' && <Badge bg="success" className="shadow-sm">Eligible</Badge>}
                                {client.is_paid ? <Badge bg="primary" className="shadow-sm">Paid</Badge> : <Badge bg="secondary" style={{ backgroundColor: '#475569' }}>Unpaid</Badge>}
                                {client.pScore > 0 && <Badge bg="info" className="text-dark fw-bold">{client.pScore}% Done</Badge>}
                            </div>
                        </div>
                        <div className="d-flex gap-2 flex-shrink-0 w-100 w-sm-auto justify-content-end mt-3 mt-sm-0">
                            <Button size="sm" variant="outline-success" className="fw-bold shadow-sm" title="Check Funding (Admin Engine)" onClick={() => { handleOpenEligibility(client); setShowDrawer(false); }} >
                                <i className="bi bi-bank2"></i>
                            </Button>
                            <Button size="sm" variant="outline-info" className="fw-bold shadow-sm" title="View Funding Blueprint" onClick={() => handleOpenBlueprint(client.id)} >
                                <i className="bi bi-file-earmark-pdf-fill"></i>
                            </Button>
                            <Button size="sm" variant="outline-secondary" className="fw-bold shadow-sm text-white" title="Client Summary" onClick={() => { handleOpenSummary(client); setShowDrawer(false); }} >
                                <i className="bi bi-card-text"></i>
                            </Button>
                            <Button size="sm" variant="light" className="fw-bold px-3 shadow-sm" onClick={() => navigate(`/company-portal/${companyId}/clients/${client.id}`)} >
                                View
                            </Button>
                        </div>
                    </ListGroup.Item>
                ))}
                {drawerStage && pipelineData[drawerStage]?.length === 0 && (
                    <div className="text-center mt-5 py-5 rounded-3" style={{ backgroundColor: '#1e293b', border: '1px dashed #334155' }}>
                        <i className="bi bi-inbox fs-1 d-block mb-3" style={{ color: '#475569' }}></i>
                        <span style={{ color: '#94a3b8' }}>No clients currently in this stage.</span>
                    </div>
                )}
            </ListGroup>
        </Offcanvas.Body>
      </Offcanvas>

      <SupportChatLauncher
        companyId={companyId}
        senderId={user?.id}
        senderName={fullName || user?.email}
        senderType="company"
        open={supportChatOpen}
        onOpenChange={setSupportChatOpen}
      />
    </div>
  );
};

export default CompanyPortalDashboard;