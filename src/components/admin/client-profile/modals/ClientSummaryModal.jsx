import React, { useState, useEffect } from "react";
import { Modal, Button, Row, Col, Card, Badge, Spinner } from "react-bootstrap";
import { supabase } from "../../../../supabaseClient";
import { isBlankStartInquiries, computeAiCounts } from "../../../../utils/inquiryCounts";
import { useToast } from "../../../shared/ui/ToastNotifier";

const BUCKET = "clients"; 

export default function ClientSummaryModal({ show, onClose, client, companyName }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // State to hold exact timestamps fetched directly from the DB
  const [clientDates, setClientDates] = useState(null);
  const [firstCommentDate, setFirstCommentDate] = useState(null);

  // Raw {experian, transunion, equifax} arrays from thread.json, kept around
  // so the "Recompute" action below can reuse the exact same
  // computeAiCounts() every save path uses, without re-fetching the file.
  const [threadGrouped, setThreadGrouped] = useState(null);
  const [backfilling, setBackfilling] = useState(false);

  // Helper to normalize strings (lowercase & remove extra spaces)
  const normClass = (v) => String(v || "").trim().toLowerCase();

  const theme = {
    bgMain: "#0B1121",
    bgCard: "#1e293b",
    headerBg: "#0f172a",
    border: "#334155",
    textMain: "#e2e8f0",
    textMuted: "#94a3b8",
    accentBlue: "#38bdf8",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
  };

  useEffect(() => {
    if (!show || !client?.id) return;

    const fetchThreadData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Exact Client Timestamps and Info
        const { data: dateData } = await supabase
            .from('clients')
            .select('created_at, updated_at, is_paid, is_uploaded, tu_eq_docs_submitted_at, paid_at, completed_at, progress, start_inquiries, approved_exp_count, approved_tu_count, approved_eq_count')
            .eq('id', client.id)
            .single();

        if (dateData) setClientDates(dateData);

        // 2. Fetch Inquiry Thread JSON
        const { data: fileData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(`${client.id}/thread.json`);

        if (fileData?.publicUrl) {
            const res = await fetch(`${fileData.publicUrl}?cacheBust=${Date.now()}`);
            if (res.ok) {
                const json = await res.json();
                const rawInquiries = [
                    ...(json.experian || []).map(i => ({ ...i, _bureau: 'Experian' })),
                    ...(json.transunion || []).map(i => ({ ...i, _bureau: 'TransUnion' })),
                    ...(json.equifax || []).map(i => ({ ...i, _bureau: 'Equifax' }))
                ];
                
                const bureauStats = {
                    Experian: { deleted: 0, linked: 0, disputable: 0, total: 0 },
                    TransUnion: { deleted: 0, linked: 0, disputable: 0, total: 0 },
                    Equifax: { deleted: 0, linked: 0, disputable: 0, total: 0 }
                };

                let grandTotal = 0;
                let grandDeleted = 0;
                let grandActionable = 0; 

                rawInquiries.forEach((item) => {
                    let bName = item._bureau || item.bureau;
                    if (bName === 'EX') bName = 'Experian';
                    if (bName === 'TU') bName = 'TransUnion';
                    if (bName === 'EQ') bName = 'Equifax';

                    if (!bureauStats[bName]) return;

                    bureauStats[bName].total++;
                    grandTotal++;

                    const cls = normClass(item.classification);

                    if (cls === 'deleted') {
                        bureauStats[bName].deleted++;
                        grandDeleted++;
                        grandActionable++;
                    } 
                    else if (['linked', 'do not dispute requested', 'do not dispute', 'dnd'].includes(cls)) {
                        bureauStats[bName].linked++;
                    } 
                    else {
                        bureauStats[bName].disputable++;
                        grandActionable++;
                    }
                });

                const threadProgress = grandActionable > 0 ? Math.round((grandDeleted / grandActionable) * 100) : 0;

                setStats({ bureauStats, grandTotal, threadProgress });
                setThreadGrouped({
                    experian: rawInquiries.filter((i) => i._bureau === 'Experian'),
                    transunion: rawInquiries.filter((i) => i._bureau === 'TransUnion'),
                    equifax: rawInquiries.filter((i) => i._bureau === 'Equifax'),
                });
            } else {
                setStats(null);
                setThreadGrouped(null);
            }
        }

        // 3. Fetch the timestamp of the very first call log for the Processing node
        const { data: callData } = await supabase
            .from('call_logs')
            .select('created_at')
            .eq('client_id', client.id)
            .order('created_at', { ascending: true })
            .limit(1);

        if (callData && callData.length > 0) {
            setFirstCommentDate(callData[0].created_at);
        } else {
            setFirstCommentDate(null);
        }

      } catch (err) {
        console.error("Error fetching summary details:", err);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    fetchThreadData();
  }, [show, client]);

  // --- DYNAMIC READINESS ENGINE MAPPER ---
  const getReadinessConfig = () => {
      const status = client?.funding_status || "RED";
      if (status === "GREEN") {
          return { color: theme.success, bg: "rgba(16, 185, 129, 0.1)", label: "READY NOW", icon: "bi-check-circle-fill", recommendations: ["Proceed to Funding Pipeline", "Submit Final Applications"] };
      } else if (status === "YELLOW") {
          return { color: theme.warning, bg: "rgba(245, 158, 11, 0.1)", label: "NEEDS ACTION", icon: "bi-exclamation-triangle-fill", recommendations: ["Utilization Reduction Recommended", "Primary Tradeline Evaluation Required"] };
      } else {
          return { color: theme.danger, bg: "rgba(239, 68, 68, 0.1)", label: "NOT READY", icon: "bi-shield-x", recommendations: ["Inquiry Review Required", "Derogatory Item Clearance", "Utilization Optimization Required"] };
      }
  };

  const rc = getReadinessConfig();
  const rawProgress = Math.round(Number(clientDates?.progress || client?.progress || 0) * 100);

  // --- DYNAMIC OPERATIONAL TIMELINE BUILDER ---
  const buildTimeline = () => {
      const cData = clientDates || client;
      
      if (!cData) return [];

      const hasProcessingStarted = !!firstCommentDate || rawProgress > 0;
      const isPaid = !!cData.is_paid;
      const hasDocs = !!cData.tu_eq_docs_submitted_at || !!cData.is_uploaded;
      const isCompleted = rawProgress >= 100;
      const hasInquiryCount = !isBlankStartInquiries(cData.start_inquiries);

      // Extract exact dates with updated_at fallbacks
      const paymentDate = isPaid ? (cData.paid_at || cData.updated_at) : null;
      const docsDate = hasDocs ? (cData.tu_eq_docs_submitted_at || cData.updated_at) : null;
      const processingDate = hasProcessingStarted ? (firstCommentDate || cData.updated_at || cData.created_at) : null;
      const completedDate = isCompleted ? (cData.completed_at || cData.updated_at) : null;
      const inquiryDate = hasInquiryCount ? (cData.updated_at || cData.created_at) : null;

      // Includes Both StateText & Date mapping!
      return [
          { label: "Client Submitted", stateText: "Submitted", active: true, date: cData.created_at },
          { label: "Inquiry Count", stateText: hasInquiryCount ? "Completed" : "Pending", active: hasInquiryCount, date: inquiryDate },
          { label: "Payment", stateText: isPaid ? "Received" : "Pending", active: isPaid, date: paymentDate },
          { label: "Documents", stateText: hasDocs ? "Received" : "Pending", active: hasDocs, date: docsDate },
          { label: "Processing", stateText: isCompleted ? "Completed" : (hasProcessingStarted ? "In Progress" : "Pending"), active: hasProcessingStarted, date: processingDate },
          { label: "Complete", stateText: isCompleted ? "Completed" : "Pending", active: isCompleted, date: completedDate }
      ];
  };

  const timeline = buildTimeline();

  // --- CYCLE TIME METRIC CALCULATION ---
  const getCycleTimeMetrics = () => {
      const cData = clientDates || client;
      
      if (!cData || !cData.created_at) return { label: "Awaiting Metrics", days: 0, status: "pending" };
      if (!cData.is_paid && !cData.paid_at) return { label: "Awaiting Payment to Start Clock", days: 0, status: "pending" };

      const startDate = new Date(cData.paid_at || cData.updated_at);
      const isCompleted = rawProgress >= 100;
      const endDate = isCompleted ? new Date(cData.completed_at || cData.updated_at) : new Date();

      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (isCompleted) return { label: "Total Cycle Time", days: diffDays, status: "finished" };
      return { label: "Active Days in Processing", days: diffDays, status: "active" };
  };
  
  const cycleMetrics = getCycleTimeMetrics();

  // Recomputes this single client's start_inquiries straight from the
  // thread.json already fetched above, using the same computeAiCounts()
  // helper every save path uses (utils/inquiryCounts.js) — so it can never
  // drift into a different number than the app itself would compute.
  // Handles both a never-set value and a bad all-zero placeholder (e.g.
  // from the free-text override in RemindersSidebar.jsx).
  const handleRecomputeStartInquiries = async () => {
    if (!threadGrouped) {
      addToast({ title: "No Report", message: "No saved report (thread.json) found for this client yet.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    const aiCounts = computeAiCounts(threadGrouped);
    const computed = `(TU ${aiCounts.ai_tu_count}, EXP ${aiCounts.ai_exp_count}, EQ ${aiCounts.ai_eq_count})`;
    const currentVal = clientDates?.start_inquiries;

    if (currentVal && !isBlankStartInquiries(currentVal)) {
      const ok = window.confirm(
        `Current Start Inquiries is "${currentVal}". Recomputing from the saved report gives "${computed}". Overwrite?`
      );
      if (!ok) return;
    }

    setBackfilling(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ start_inquiries: computed })
        .eq("id", client.id);
      if (error) throw error;
      setClientDates((prev) => ({ ...(prev || {}), start_inquiries: computed }));
    } catch (err) {
      addToast({ title: "Update Failed", message: "Failed to update Start Inquiries: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setBackfilling(false);
    }
  };

  const handleCopy = () => {
    if (!client) return;
    const { bureauStats } = stats || { bureauStats: null };

    const fmt = (b) => {
        if (!bureauStats) return "Data Pending";
        const d = bureauStats[b];
        return `${d.deleted} Deleted | ${d.linked} Linked | ${d.disputable} Disputable`;
    };
    
    const text = `
📋 CLIENT READINESS & SUMMARY
Name: ${client.full_name}
Agent: ${client.agent || "Unassigned"}
Start Inquiries: ${clientDates?.start_inquiries || client.start_inquiries || "0"}
Funding Status: ${rc.label}
Operational Progress: ${rawProgress}%
Cycle Time: ${cycleMetrics.days} Days

📌 RECOMMENDED ACTIONS:
${rc.recommendations.map(r => `- ${r}`).join('\n')}

📊 FULFILLMENT BREAKDOWN (Inquiries):
EXP: ${fmt('Experian')}
TU:  ${fmt('TransUnion')}
EQ:  ${fmt('Equifax')}
    `.trim();
    
    navigator.clipboard.writeText(text);
    addToast({ title: "Copied", message: "Summary copied to clipboard!", variant: "success", icon: "bi-clipboard-check-fill", timeout: 3000 });
  };

  if (!client) return null;

  // Check if company is Dennis (Case insensitive matching)
  const isDennis = String(companyName || "").toLowerCase().includes("trusted");

  return (
    <Modal show={show} onHide={onClose} centered size="xl" contentClassName="border-0 shadow-lg" style={{ borderRadius: '16px' }}>
      <Modal.Header closeButton closeVariant="white" className="border-bottom" style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}>
        <Modal.Title className="fw-bold text-white">
            <i className="bi bi-person-vcard me-2" style={{ color: theme.accentBlue }}></i>
            Client Profile: {client.full_name}
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="p-0" style={{ backgroundColor: theme.bgMain }}>
        <Row className="g-0 h-100">
            
            {/* LEFT COLUMN: OPERATIONAL TIMELINE & METRICS */}
            <Col lg={4} className="border-end p-4 d-flex flex-column justify-content-between" style={{ borderColor: theme.border, backgroundColor: theme.bgCard }}>
                <div>
                    <h6 className="fw-bold text-uppercase mb-4" style={{ color: theme.textMuted, fontSize: '0.8rem', letterSpacing: '1px' }}>
                        <i className="bi bi-clock-history me-2"></i> Operational Timeline
                    </h6>
                    
                    {loading ? (
                        <div className="text-center py-4"><Spinner size="sm" className="text-info" /></div>
                    ) : (
                        <div className="position-relative ms-2">
                            {/* Vertical Line */}
                            <div className="position-absolute h-100" style={{ left: '11px', top: '5px', width: '2px', backgroundColor: theme.border }}></div>
                            
                            {timeline.map((step, idx) => (
                                <div key={idx} className="position-relative d-flex align-items-start mb-4">
                                    <div className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 z-2 mt-1" 
                                         style={{ 
                                             width: '24px', height: '24px', 
                                             backgroundColor: step.active ? theme.accentBlue : theme.bgCard, 
                                             border: `2px solid ${step.active ? theme.accentBlue : theme.border}`,
                                             color: step.active ? '#fff' : 'transparent'
                                         }}>
                                        {step.active && <i className="bi bi-check" style={{ fontSize: '12px' }}></i>}
                                    </div>
                                    <div className="ms-3">
                                        <h6 className={`fw-bold mb-1 ${step.active ? 'text-white' : 'text-muted'}`} style={{ fontSize: '0.9rem' }}>{step.label}</h6>
                                        <div className="d-flex flex-column gap-1">
                                            <small className="font-monospace text-uppercase fw-bold" style={{ color: step.active ? theme.accentBlue : theme.textMuted, fontSize: '0.7rem' }}>
                                                {step.stateText}
                                            </small>
                                            {/* 👇 Stacked date right below the state text 👇 */}
                                            {step.active && step.date && (
                                                <small className="font-monospace text-muted" style={{ fontSize: '0.65rem' }}>
                                                    {new Date(step.date).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}
                                                </small>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* JOURNEY METRICS CYCLE CLOCK (Only visible to Dennis) */}
                {!loading && isDennis && (
                    <Card className="border-0 shadow-sm rounded-3 mt-4" style={{ backgroundColor: theme.headerBg }}>
                        <Card.Body className="p-3 text-center">
                            <span className="small text-uppercase fw-bold font-monospace d-block mb-1" style={{ color: theme.textMuted }}>{cycleMetrics.label}</span>
                            <div className="d-flex align-items-center justify-content-center gap-2">
                                <i className={`bi bi-stopwatch fs-4 ${cycleMetrics.status === 'finished' ? 'text-success' : cycleMetrics.status === 'active' ? 'text-info' : 'text-muted'}`}></i>
                                <h3 className="fw-bolder mb-0 text-white" style={{ letterSpacing: '-1px' }}>{cycleMetrics.days} <span className="fs-6 fw-normal" style={{color: theme.textMuted}}>Days</span></h3>
                            </div>
                        </Card.Body>
                    </Card>
                )}
            </Col>

            {/* RIGHT COLUMN: READINESS & RECOMMENDATIONS ENGINE */}
            <Col lg={8} className="p-4">
                
                {/* 1. Readiness Engine Module */}
                <h6 className="fw-bold text-uppercase mb-3" style={{ color: theme.textMuted, fontSize: '0.8rem', letterSpacing: '1px' }}>
                    <i className="bi bi-cpu-fill me-2"></i> Readiness Engine
                </h6>
                <div className="d-flex align-items-center p-3 rounded-4 mb-4 border shadow-sm" style={{ backgroundColor: rc.bg, borderColor: rc.color }}>
                    <i className={`bi ${rc.icon} display-4 me-3`} style={{ color: rc.color }}></i>
                    <div>
                        <h4 className="fw-bold mb-1 text-uppercase" style={{ color: rc.color, letterSpacing: '1px' }}>{rc.label}</h4>
                        <p className="mb-0 small fw-bold" style={{ color: theme.textMain }}>
                            {client.funding_status === "GREEN" ? "Profile is positioned for optimal capital allocation." : "System algorithm has identified structural obstacles preventing immediate funding access."}
                        </p>
                    </div>
                </div>

                {/* 2. Recommendation Engine Module */}
                <h6 className="fw-bold text-uppercase mb-3" style={{ color: theme.textMuted, fontSize: '0.8rem', letterSpacing: '1px' }}>
                    <i className="bi bi-bullseye me-2"></i> Recommended Actions
                </h6>
                <Card className="border shadow-sm rounded-4 mb-4" style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}>
                    <Card.Body className="p-3">
                        <ul className="list-group list-group-flush bg-transparent">
                            {rc.recommendations.map((rec, i) => (
                                <li key={i} className="list-group-item bg-transparent d-flex align-items-center border-0 px-0 py-2">
                                    <i className="bi bi-arrow-right-square-fill me-3 fs-5" style={{ color: theme.accentBlue }}></i>
                                    <span className="fw-bold" style={{ color: theme.textMain }}>{rec}</span>
                                </li>
                            ))}
                        </ul>
                    </Card.Body>
                </Card>

                {/* 3. Service Fulfillment Layer (Inquiries) */}
                <h6 className="fw-bold text-uppercase mb-3 d-flex justify-content-between align-items-center" style={{ color: theme.textMuted, fontSize: '0.8rem', letterSpacing: '1px' }}>
                    <div><i className="bi bi-gear-wide-connected me-2"></i> Fulfillment Layer: Inquiry Processing</div>
                    <div className="d-flex align-items-center gap-2">
                        <Badge bg="secondary" className="fw-bold border" style={{ borderColor: theme.border, fontSize: '0.7rem' }}>
                            Start Inquiries: {clientDates?.start_inquiries || client.start_inquiries || "0"}
                        </Badge>
                        <Button
                            variant="outline-light"
                            size="sm"
                            className="cmd-btn py-0 px-2"
                            style={{ fontSize: '0.7rem' }}
                            onClick={handleRecomputeStartInquiries}
                            disabled={loading || backfilling || !threadGrouped}
                            title="Recompute Start Inquiries from the saved report (thread.json)"
                        >
                            {backfilling ? <Spinner animation="border" size="sm" /> : <><i className="bi bi-arrow-repeat me-1"></i>Recompute</>}
                        </Button>
                    </div>
                </h6>
                
                {loading ? (
                    <div className="text-center py-4 rounded-4 border" style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}>
                        <Spinner animation="border" size="sm" className="me-2 text-info" />
                        <span className="text-muted small fw-bold">Syncing fulfillment data...</span>
                    </div>
                ) : stats ? (
                    <Row className="g-3">
                        {['Experian', 'TransUnion', 'Equifax'].map((bureau) => {
                            const data = stats.bureauStats[bureau];
                            const isEx = bureau === 'Experian';
                            const isTu = bureau === 'TransUnion';
                            const approvedKey = isEx ? 'approved_exp_count' : isTu ? 'approved_tu_count' : 'approved_eq_count';
                            const approvedCount = clientDates?.[approvedKey];

                            return (
                                <Col md={4} key={bureau}>
                                    <Card className="h-100 shadow-sm rounded-4 border" style={{ backgroundColor: theme.headerBg, borderColor: theme.border, borderTop: `3px solid ${isEx ? theme.accentBlue : isTu ? theme.warning : theme.danger} !important` }}>
                                        <Card.Body className="p-3">
                                            <h6 className="fw-bold text-white mb-3 border-bottom pb-2" style={{ borderColor: `${theme.border} !important` }}>
                                                {bureau} <span className="text-muted small fw-normal float-end">({data.total})</span>
                                            </h6>
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <span className="small fw-bold text-muted">Deleted</span>
                                                <Badge bg="success" className="rounded-pill">{data.deleted}</Badge>
                                            </div>
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <span className="small fw-bold text-muted">Do Not Dispute</span>
                                                <Badge bg="danger" className="rounded-pill">{data.linked}</Badge>
                                            </div>
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <span className="small fw-bold text-muted">To Dispute</span>
                                                <Badge bg="primary" className="rounded-pill">{data.disputable}</Badge>
                                            </div>
                                            <div className="d-flex justify-content-between align-items-center pt-2 border-top" style={{ borderColor: `${theme.border} !important` }}>
                                                <span className="small fw-bold text-muted">Approved to Dispute</span>
                                                <Badge bg={approvedCount != null ? "info" : "secondary"} className="rounded-pill">{approvedCount ?? "Pending"}</Badge>
                                            </div>
                                        </Card.Body>
                                    </Card>
                                </Col>
                            );
                        })}
                    </Row>
                ) : (
                    <div className="text-center py-4 rounded-4 border" style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}>
                        <i className="bi bi-inbox text-muted fs-4 d-block mb-2"></i>
                        <span className="text-muted small fw-bold">No inquiry thread data found yet.</span>
                    </div>
                )}
            </Col>
        </Row>
      </Modal.Body>
      
      <Modal.Footer className="border-top" style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}>
        <Button variant="outline-info" className="fw-bold shadow-sm" onClick={handleCopy} disabled={loading}>
            <i className="bi bi-clipboard me-2"></i> Copy Summary
        </Button>
        <Button variant="secondary" className="fw-bold shadow-sm" style={{ backgroundColor: theme.border, borderColor: theme.border }} onClick={onClose}>
            Close Window
        </Button>
      </Modal.Footer>
    </Modal>
  );
}