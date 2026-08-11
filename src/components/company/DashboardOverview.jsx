import React, { useMemo, useState } from 'react';
import { useCompanyAuth } from '../../context/CompanyAuthContext';
import { Spinner, Alert, Badge, Card, Row, Col, Table, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { serviceLabel } from '../../utils/services';

const DashboardOverview = ({ refreshKey, pipelineData, handleOpenSummary }) => {
  const { companyId, loading: authLoading, error: authError } = useCompanyAuth();
  const navigate = useNavigate();

  // Selected stage for the table below
  const [activeStage, setActiveStage] = useState('awaitingPayment');

  const theme = {
    bgCard: "#131b2f",
    headerBg: "#0f172a",
    border: "#1e293b",
    textMain: "#e2e8f0",
    textMuted: "#94a3b8",
    success: "#10b981",
    warning: "#fbbf24",
    danger: "#ef4444",
    accent: "#38bdf8",
    unpaid: "#94a3b8",
    docs: "#f59e0b",
    review: "#c084fc",
    processing: "#3b82f6",
  };

  // --- 1. FLATTEN EXACT 5-STEP OPERATIONAL STAGES ---
  const allClients = useMemo(() => {
    if (!pipelineData) return [];
    
    const flat = [
      ...(pipelineData.awaitingPayment || []),
      ...(pipelineData.awaitingDocs || []),
      ...(pipelineData.pendingReview || []),
      ...(pipelineData.processing || []),
      ...(pipelineData.completed || [])
    ];
    
    return Array.from(new Map(flat.map(c => [c.id, c])).values());
  }, [pipelineData]);

  // --- 2. OPERATIONAL PIPELINE MATH ---
  const opStats = useMemo(() => {
    return {
      awaitingPayment: allClients.filter(c => c.opStage === 'awaitingPayment').length,
      awaitingDocs: allClients.filter(c => c.opStage === 'awaitingDocs').length,
      pendingReview: allClients.filter(c => c.opStage === 'pendingReview').length,
      processing: allClients.filter(c => c.opStage === 'processing').length,
      completed: allClients.filter(c => c.opStage === 'completed').length,
    };
  }, [allClients]);

  // --- 3. BOTTLENECK / SLA CALCULATIONS ---
  const bottlenecks = useMemo(() => {
    const now = new Date();
    const issues = [];

    allClients.forEach(client => {
      if (client.opStage === 'awaitingPayment') {
        const createdDate = new Date(client.created_at);
        const daysPending = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
        if (daysPending >= 3) {
          issues.push({ id: client.id, name: client.full_name || 'Unknown', issue: 'Payment Overdue', days: daysPending, severity: 'warning' });
        }
      }
      else if (client.opStage === 'awaitingDocs') {
        const paidDate = new Date(client.paid_at || client.updated_at);
        const daysPending = Math.floor((now - paidDate) / (1000 * 60 * 60 * 24));
        if (daysPending >= 3) {
          issues.push({ id: client.id, name: client.full_name || 'Unknown', issue: 'Missing Documents', days: daysPending, severity: 'danger' });
        }
      }
      else if (client.opStage === 'pendingReview') {
        const docsDate = new Date(client.tu_eq_docs_submitted_at || client.updated_at);
        const daysPending = Math.floor((now - docsDate) / (1000 * 60 * 60 * 24));
        if (daysPending >= 3) {
          issues.push({ id: client.id, name: client.full_name || 'Unknown', issue: 'Review Delayed', days: daysPending, severity: 'danger' });
        }
      }
      else if (client.opStage === 'processing') {
        const startDate = new Date(client.paid_at || client.updated_at);
        const daysActive = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
        if (daysActive >= 35) {
          issues.push({ id: client.id, name: client.full_name || 'Unknown', issue: 'Stalled Processing', days: daysActive, severity: 'danger' });
        }
      }
    });

    return issues.sort((a, b) => b.days - a.days).slice(0, 10);
  }, [allClients]);

  // --- 4. READINESS DISTRIBUTION MATH ---
  const readinessCounts = useMemo(() => {
    let green = 0; let yellow = 0; let red = 0;
    
    allClients.forEach(c => {
      if (c.funding_status === 'GREEN') green++;
      else if (c.funding_status === 'YELLOW') yellow++;
      else red++; 
    });

    return { green, yellow, red, total: allClients.length };
  }, [allClients]);

  // --- 5. ACTIVE TABLE DATA ---
  const displayedClients = useMemo(() => {
    return allClients.filter(c => c.opStage === activeStage);
  }, [allClients, activeStage]);

  const STAGE_LABELS = {
    awaitingPayment: { label: "Awaiting Payment", color: theme.unpaid },
    awaitingDocs: { label: "Awaiting Documents", color: theme.docs },
    pendingReview: { label: "Pending Review", color: theme.review },
    processing: { label: "Processing Active", color: theme.processing },
    completed: { label: "Fully Completed", color: theme.success }
  };

  if (authLoading) {
    return (
      <div className="d-flex align-items-center justify-content-center w-100 h-100 min-vh-50">
        <Spinner animation="border" style={{ color: theme.accent }} />
      </div>
    );
  }

  if (authError || !pipelineData) {
    return <Alert variant="danger" className="m-3">Error loading metrics.</Alert>;
  }

  return (
    <div className="w-100 h-100 d-flex flex-column gap-3">
      
      {/* ROW 1: OPERATIONAL 5-STEP PIPELINE FLOW */}
      <div className="flex-shrink-0">
        <h6 className="fw-bold text-uppercase mb-2" style={{ color: theme.textMuted, fontSize: '0.8rem', letterSpacing: '1px' }}>
          <i className="bi bi-funnel-fill me-2" style={{ color: theme.accent }}></i> Client Pipeline Flow
        </h6>
        <div className="d-flex align-items-stretch shadow-sm rounded-4 overflow-hidden border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
            
            {/* Step 1: Unpaid */}
            <div 
                className="flex-fill p-3 position-relative text-center border-end" 
                style={{ borderColor: theme.border, cursor: 'pointer', backgroundColor: activeStage === 'awaitingPayment' ? 'rgba(148, 163, 184, 0.05)' : 'transparent', transition: '0.2s' }} 
                onClick={() => setActiveStage('awaitingPayment')}
            >
                <div className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 ${activeStage === 'awaitingPayment' ? 'shadow' : ''}`} style={{ width: '40px', height: '40px', backgroundColor: 'rgba(148, 163, 184, 0.1)', border: `1px solid ${theme.unpaid}` }}>
                    <i className="bi bi-credit-card-fill fs-5" style={{ color: theme.unpaid }}></i>
                </div>
                <h3 className="fw-bolder text-white mb-0 lh-1">{opStats.awaitingPayment}</h3>
                <span className="small fw-bold text-uppercase" style={{ color: theme.unpaid, fontSize: '0.65rem' }}>Awaiting Payment</span>
                <i className="bi bi-chevron-right position-absolute top-50 translate-middle-y fs-4" style={{ right: '-12px', color: theme.border, zIndex: 2, background: activeStage === 'awaitingPayment' ? '#182237' : theme.bgCard }}></i>
            </div>

            {/* Step 2: Awaiting Docs */}
            <div 
                className="flex-fill p-3 position-relative text-center border-end" 
                style={{ borderColor: theme.border, cursor: 'pointer', backgroundColor: activeStage === 'awaitingDocs' ? 'rgba(245, 158, 11, 0.05)' : 'transparent', transition: '0.2s' }} 
                onClick={() => setActiveStage('awaitingDocs')}
            >
                <div className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 ${activeStage === 'awaitingDocs' ? 'shadow' : ''}`} style={{ width: '40px', height: '40px', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: `1px solid ${theme.docs}` }}>
                    <i className="bi bi-file-earmark-arrow-up-fill fs-5" style={{ color: theme.docs }}></i>
                </div>
                <h3 className="fw-bolder text-white mb-0 lh-1">{opStats.awaitingDocs}</h3>
                <span className="small fw-bold text-uppercase" style={{ color: theme.docs, fontSize: '0.65rem' }}>Awaiting Docs</span>
                <i className="bi bi-chevron-right position-absolute top-50 translate-middle-y fs-4" style={{ right: '-12px', color: theme.border, zIndex: 2, background: activeStage === 'awaitingDocs' ? '#19202a' : theme.bgCard }}></i>
            </div>

            {/* Step 3: Pending Review */}
            <div 
                className="flex-fill p-3 position-relative text-center border-end" 
                style={{ borderColor: theme.border, cursor: 'pointer', backgroundColor: activeStage === 'pendingReview' ? 'rgba(192, 132, 252, 0.05)' : 'transparent', transition: '0.2s' }} 
                onClick={() => setActiveStage('pendingReview')}
            >
                <div className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 ${activeStage === 'pendingReview' ? 'shadow' : ''}`} style={{ width: '40px', height: '40px', backgroundColor: 'rgba(192, 132, 252, 0.1)', border: `1px solid ${theme.review}` }}>
                    <i className="bi bi-search fs-5" style={{ color: theme.review }}></i>
                </div>
                <h3 className="fw-bolder text-white mb-0 lh-1">{opStats.pendingReview}</h3>
                <span className="small fw-bold text-uppercase" style={{ color: theme.review, fontSize: '0.65rem' }}>Pending Review</span>
                <i className="bi bi-chevron-right position-absolute top-50 translate-middle-y fs-4" style={{ right: '-12px', color: theme.border, zIndex: 2, background: activeStage === 'pendingReview' ? '#171c32' : theme.bgCard }}></i>
            </div>

            {/* Step 4: Processing */}
            <div 
                className="flex-fill p-3 position-relative text-center border-end" 
                style={{ borderColor: theme.border, cursor: 'pointer', backgroundColor: activeStage === 'processing' ? 'rgba(59, 130, 246, 0.05)' : 'transparent', transition: '0.2s' }} 
                onClick={() => setActiveStage('processing')}
            >
                <div className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 ${activeStage === 'processing' ? 'shadow' : ''}`} style={{ width: '40px', height: '40px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: `1px solid ${theme.processing}` }}>
                    <i className="bi bi-gear-wide-connected fs-5" style={{ color: theme.processing }}></i>
                </div>
                <h3 className="fw-bolder text-white mb-0 lh-1">{opStats.processing}</h3>
                <span className="small fw-bold text-uppercase" style={{ color: theme.processing, fontSize: '0.65rem' }}>Processing Active</span>
                <i className="bi bi-chevron-right position-absolute top-50 translate-middle-y fs-4" style={{ right: '-12px', color: theme.border, zIndex: 2, background: activeStage === 'processing' ? '#111b33' : theme.bgCard }}></i>
            </div>

            {/* Step 5: Completed */}
            <div 
                className="flex-fill p-3 position-relative text-center" 
                style={{ cursor: 'pointer', backgroundColor: activeStage === 'completed' ? 'rgba(16, 185, 129, 0.05)' : 'transparent', transition: '0.2s' }} 
                onClick={() => setActiveStage('completed')}
            >
                <div className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 ${activeStage === 'completed' ? 'shadow' : ''}`} style={{ width: '40px', height: '40px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: `1px solid ${theme.success}` }}>
                    <i className="bi bi-check-all fs-5" style={{ color: theme.success }}></i>
                </div>
                <h3 className="fw-bolder text-white mb-0 lh-1">{opStats.completed}</h3>
                <span className="small fw-bold text-uppercase" style={{ color: theme.success, fontSize: '0.65rem' }}>Fully Completed</span>
            </div>

        </div>
      </div>

      {/* ROW 2: READINESS ENGINE & SLAS */}
      <Row className="g-3 flex-shrink-0">
        
        {/* Left Col: Readiness KPIs */}
        <Col lg={5} className="d-flex flex-column gap-3">
          <Card className="border-0 shadow-sm rounded-4 h-100" style={{ backgroundColor: theme.bgCard }}>
            <Card.Body className="p-4 d-flex align-items-center">
              <div className="flex-grow-1">
                <h6 className="fw-bold text-uppercase mb-3" style={{ color: theme.textMuted, fontSize: '0.8rem', letterSpacing: '1px' }}>
                  <i className="bi bi-cpu-fill me-2" style={{ color: theme.accent }}></i> Readiness Distribution
                </h6>
                <div className="d-flex align-items-center gap-4">
                  <div className="position-relative d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: '100px', height: '100px' }}>
                    <svg viewBox="0 0 36 36" className="w-100 h-100">
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1e293b" strokeWidth="3" />
                      {readinessCounts.total > 0 && (
                        <>
                          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={theme.success} strokeWidth="3" strokeDasharray={`${(readinessCounts.green/readinessCounts.total)*100}, 100`} />
                          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={theme.warning} strokeWidth="3" strokeDasharray={`${(readinessCounts.yellow/readinessCounts.total)*100}, 100`} strokeDashoffset={`-${(readinessCounts.green/readinessCounts.total)*100}`} />
                          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={theme.danger} strokeWidth="3" strokeDasharray={`${(readinessCounts.red/readinessCounts.total)*100}, 100`} strokeDashoffset={`-${((readinessCounts.green+readinessCounts.yellow)/readinessCounts.total)*100}`} />
                        </>
                      )}
                    </svg>
                    <div className="position-absolute text-center">
                      <h4 className="fw-bolder text-white mb-0 lh-1">{readinessCounts.total}</h4>
                    </div>
                  </div>
                  <div className="d-flex flex-column gap-2 flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="small fw-bold text-white"><i className="bi bi-circle-fill me-2" style={{ color: theme.success, fontSize: '8px' }}></i>Ready Now</span>
                      <Badge bg="dark" className="border" style={{ borderColor: theme.border }}>{readinessCounts.green}</Badge>
                    </div>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="small fw-bold text-white"><i className="bi bi-circle-fill me-2" style={{ color: theme.warning, fontSize: '8px' }}></i>Needs Action</span>
                      <Badge bg="dark" className="border" style={{ borderColor: theme.border }}>{readinessCounts.yellow}</Badge>
                    </div>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="small fw-bold text-white"><i className="bi bi-circle-fill me-2" style={{ color: theme.danger, fontSize: '8px' }}></i>Not Ready</span>
                      <Badge bg="dark" className="border" style={{ borderColor: theme.border }}>{readinessCounts.red}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>

        {/* Right Col: Action Required Bottenecks */}
        <Col lg={7} className="d-flex flex-column min-vh-0">
            <Card className="border-0 shadow-sm rounded-4 flex-grow-1 min-vh-0 d-flex flex-column" style={{ backgroundColor: theme.bgCard, maxHeight: '200px' }}>
                <Card.Header className="bg-transparent pt-3 px-4 pb-2 border-bottom flex-shrink-0" style={{ borderColor: theme.border }}>
                <h6 className="fw-bold text-uppercase mb-0" style={{ color: theme.textMuted, fontSize: '0.8rem', letterSpacing: '1px' }}>
                    <i className="bi bi-exclamation-octagon-fill me-2" style={{ color: theme.danger }}></i> Action Required (SLA Exceptions)
                </h6>
                </Card.Header>
                <Card.Body className="p-0 overflow-auto custom-scrollbar flex-grow-1">
                {bottlenecks.length > 0 ? (
                    <Table hover responsive className="mb-0 align-middle small border-0 text-white">
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: theme.headerBg, zIndex: 1 }}>
                        <tr className="font-monospace text-uppercase" style={{ fontSize: '0.65rem', color: theme.textMuted }}>
                        <th className="ps-4 py-2 border-bottom" style={{ borderColor: theme.border }}>Client Name</th>
                        <th className="border-bottom" style={{ borderColor: theme.border }}>Bottleneck Issue</th>
                        <th className="border-bottom" style={{ borderColor: theme.border }}>Aging</th>
                        <th className="pe-4 border-bottom text-end" style={{ borderColor: theme.border }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bottlenecks.map((issue, idx) => (
                        <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td className="ps-4 fw-bold">{issue.name}</td>
                            <td>
                                <Badge bg={issue.severity} className="text-white bg-opacity-75 px-2 py-1 shadow-sm">
                                    {issue.issue}
                                </Badge>
                            </td>
                            <td className="font-monospace fw-bold" style={{ color: theme.danger }}>{issue.days} Days</td>
                            <td className="pe-4 text-end">
                            <Button size="sm" variant="outline-info" style={{fontSize: '0.7rem'}} className="fw-bold shadow-sm" onClick={() => navigate(`/company-portal/${companyId}/clients/${issue.id}`)}>
                                Resolve <i className="bi bi-arrow-right ms-1"></i>
                            </Button>
                            </td>
                        </tr>
                        ))}
                    </tbody>
                    </Table>
                ) : (
                    <div className="h-100 d-flex flex-column align-items-center justify-content-center py-4 text-center">
                        <i className="bi bi-shield-check display-6 mb-2" style={{ color: theme.success, opacity: 0.8 }}></i>
                        <h6 className="fw-bold text-white mb-1">Pipeline Healthy</h6>
                        <p className="small mb-0" style={{ color: theme.textMuted }}>No clients are currently stuck.</p>
                    </div>
                )}
                </Card.Body>
            </Card>
        </Col>
      </Row>

      {/* ROW 3: INTERACTIVE CLIENT TABLE */}
      <Card className="border-0 shadow-sm rounded-4 flex-grow-1 d-flex flex-column min-vh-0" style={{ backgroundColor: theme.bgCard }}>
        <Card.Header className="bg-transparent pt-4 px-4 pb-3 border-bottom d-flex justify-content-between align-items-center flex-shrink-0" style={{ borderColor: theme.border }}>
          <h6 className="fw-bold text-uppercase mb-0" style={{ color: STAGE_LABELS[activeStage].color, fontSize: '0.9rem', letterSpacing: '1px' }}>
            {STAGE_LABELS[activeStage].label} Clients
          </h6>
          <Badge bg="dark" className="border" style={{ borderColor: theme.border }}>{displayedClients.length} Records</Badge>
        </Card.Header>
        <Card.Body className="p-0 overflow-auto custom-scrollbar flex-grow-1 position-relative">
          
          {/* 👇 NEW: Special Attention Warning for Pending Review! 👇 */}
          {activeStage === 'pendingReview' && (
             <div className="px-4 pt-3 pb-1">
                <Alert variant="warning" className="small fw-bold mb-0 border-warning d-flex align-items-center shadow-sm" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>
                   <i className="bi bi-info-circle-fill me-2 fs-5"></i>
                   Special Attention Required: Files in this stage may take up to 7 days to process.
                </Alert>
             </div>
          )}

          {displayedClients.length > 0 ? (
            <Table hover responsive className="mb-0 align-middle small border-0 text-white mt-2">
              <thead style={{ position: 'sticky', top: 0, backgroundColor: theme.headerBg, zIndex: 1 }}>
                <tr className="font-monospace text-uppercase" style={{ fontSize: '0.7rem', color: theme.textMuted }}>
                  <th className="ps-4 py-3 border-bottom" style={{ borderColor: theme.border }}>Client Name</th>
                  <th className="border-bottom" style={{ borderColor: theme.border }}>Assigned Agent</th>
                  <th className="border-bottom" style={{ borderColor: theme.border }}>Funding Status</th>
                  <th className="border-bottom" style={{ borderColor: theme.border }}>Op. Progress</th>
                  <th className="pe-4 border-bottom text-end" style={{ borderColor: theme.border }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedClients.map((c) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td className="ps-4">
                        <div className="d-flex align-items-center flex-wrap gap-2">
                            <span className="fw-bold">{c.full_name || 'Unnamed Client'}</span>
                            {c.is_paused && <Badge bg="warning" text="dark" style={{fontSize: '0.6rem'}}><i className="bi bi-pause-fill"></i> PAUSED</Badge>}
                        </div>
                        <div className="small text-muted mt-1 text-capitalize">
                          {serviceLabel(c, "—")} • Inq: {c.start_inquiries || "—"}
                        </div>
                    </td>
                    <td style={{ color: theme.textMuted }}>{c.agentName || c.agent || 'Unassigned'}</td>
                    <td>
                      {c.funding_status === 'GREEN' && <Badge bg="success"><i className="bi bi-check-circle-fill me-1"></i> Ready Now</Badge>}
                      {c.funding_status === 'YELLOW' && <Badge bg="warning" text="dark"><i className="bi bi-exclamation-triangle-fill me-1"></i> Needs Action</Badge>}
                      {c.funding_status !== 'GREEN' && c.funding_status !== 'YELLOW' && <Badge bg="danger"><i className="bi bi-shield-x me-1"></i> Not Ready</Badge>}
                    </td>
                    <td>
                      <Badge bg="info" className="text-dark fw-bold">{c.pScore || 0}% Done</Badge>
                    </td>
                    <td className="pe-4 text-end">
                      <div className="d-flex justify-content-end gap-2">
                          <Button size="sm" variant="outline-secondary" className="fw-bold shadow-sm text-white border-secondary" title="Client Summary" onClick={() => handleOpenSummary(c)}>
                              <i className="bi bi-card-text"></i>
                          </Button>
                          <Button size="sm" variant="light" className="fw-bold px-3 shadow-sm" onClick={() => navigate(`/company-portal/${companyId}/clients/${c.id}`)}>
                              View Profile
                          </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="h-100 d-flex flex-column align-items-center justify-content-center py-5 text-center mt-3">
                <i className="bi bi-inbox display-4 mb-3" style={{ color: theme.textMuted, opacity: 0.5 }}></i>
                <h5 className="fw-bold text-white mb-1">No Clients in this Stage</h5>
                <p className="small mb-0" style={{ color: theme.textMuted }}>Clients will appear here once they reach this phase of the pipeline.</p>
            </div>
          )}
        </Card.Body>
      </Card>
      
    </div>
  );
};

export default DashboardOverview;