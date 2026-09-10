import React, { useState, useEffect, useMemo } from "react";
import { Modal, Button, Row, Col, Card, Badge, Spinner } from "react-bootstrap";
import { supabase } from "../../../../supabaseClient";
import { isBlankStartInquiries, computeAiCounts } from "../../../../utils/inquiryCounts";
import { useToast } from "../../../shared/ui/ToastNotifier";
import useClientNotes from "../../../../hooks/useClientNotes";
import { useConfirm } from "../../../shared/ui/ConfirmDialog";
import { GAP_REASON_PRESETS, gapKeyFor } from "../../../../utils/timelineGapNotes";

// Below this many days between two consecutive completed timeline steps,
// the gap isn't worth flagging — normal same-day/next-day turnaround
// shouldn't prompt anyone to explain themselves.
const MIN_GAP_DAYS_TO_FLAG = 1;

const BUCKET = "clients"; 

// `showGapReasons` (default false) gates the Operational Timeline's gap
// badges + reason editor — this modal is shared across the admin client
// list (AdminClientList.jsx) AND every company/broker portal's client list
// (CompanyPortalDashboard.jsx, ServiceClientList.jsx,
// InquiryRemovalClientList.jsx, BrokerClientList.jsx), so it defaults OFF
// and only the admin call site opts in. Internal delay reasons ("Docs not
// received", "Client unresponsive," etc.) are staff-only context, not
// something partners should see or be able to add. Defaulting to false
// (rather than CoverLetterAssets.jsx's showAiResults=true default) means a
// future new call site that forgets to pass this stays safe by default.
export default function ClientSummaryModal({ show, onClose, client, companyName, showGapReasons = false }) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
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

  // Fetched separately from the main dateData query below (own try/catch,
  // fails silently to null) because clients.pause_reason
  // (sql/add_pause_reason.sql) is a brand-new column — until that
  // migration is run, selecting it would error the whole combined query
  // above and blank out is_paid/paid_at/etc for every caller of this
  // modal. Unlike the gap-reason feature, this banner is meant to be
  // visible in the company/broker portal too, so it can't be gated behind
  // showGapReasons — it just degrades to "no reason on file" instead.
  const [pauseReason, setPauseReason] = useState(null);

  // Reasons for gaps on the Operational Timeline below (e.g. "why did 5
  // days pass between Payment and Documents") — stored as gap_key-tagged
  // rows in the same client_notes table Manager Notes already uses, see
  // src/utils/timelineGapNotes.js. Only fetched at all when
  // showGapReasons is on (admin view) — client_notes' RLS already blocks
  // company/broker reads (is_admin_staff() only), but there's no reason to
  // even attempt the query on a surface that will never render the result.
  const { notes: allNotes, addNote: addManagerNote, migrationMissing: notesMigrationMissing } = useClientNotes(showGapReasons ? client?.id : null);
  const [editingGapKey, setEditingGapKey] = useState(null);
  const [gapReasonDraft, setGapReasonDraft] = useState("");
  const [savingGapKey, setSavingGapKey] = useState(null);

  const gapNotesByKey = useMemo(() => {
    const map = {};
    for (const n of allNotes) {
      if (!n.gap_key) continue;
      if (!map[n.gap_key] || new Date(n.created_at) > new Date(map[n.gap_key].created_at)) {
        map[n.gap_key] = n;
      }
    }
    return map;
  }, [allNotes]);

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
            .select('created_at, updated_at, is_paid, is_uploaded, tu_eq_docs_submitted_at, paid_at, completed_at, progress, start_inquiries, approved_exp_count, approved_tu_count, approved_eq_count, is_paused, paused_at')
            .eq('id', client.id)
            .single();

        if (dateData) setClientDates(dateData);

        // 1b. Fetch pause_reason in isolation — see the pauseReason state
        // comment above for why this is split out from the query above.
        try {
          const { data: pauseData, error: pauseErr } = await supabase
            .from('clients')
            .select('pause_reason')
            .eq('id', client.id)
            .single();
          if (pauseErr) throw pauseErr;
          setPauseReason(pauseData?.pause_reason || null);
        } catch (pauseFetchErr) {
          console.warn("pause_reason unavailable (migration likely not run yet):", pauseFetchErr.message);
          setPauseReason(null);
        }

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

  // Pairs each step with the gap to the NEXT step, when both are
  // completed and more than MIN_GAP_DAYS_TO_FLAG days apart — e.g. Payment
  // Received Sep 3 -> Documents Received Sep 8 is a 5-day gap worth
  // flagging; same-day turnaround isn't.
  const timelineWithGaps = timeline.map((step, idx) => {
    const next = timeline[idx + 1];
    if (!showGapReasons || !(step.active && step.date && next?.active && next.date)) {
      return { ...step, gap: null };
    }
    const diffDays = (new Date(next.date) - new Date(step.date)) / (1000 * 60 * 60 * 24);
    if (diffDays < MIN_GAP_DAYS_TO_FLAG) return { ...step, gap: null };

    const key = gapKeyFor(step.label, next.label);
    return { ...step, gap: { key, days: Math.round(diffDays), note: gapNotesByKey[key] || null } };
  });

  const handleSaveGapReason = async (gapKey) => {
    const reason = gapReasonDraft.trim();
    if (!reason) return;
    setSavingGapKey(gapKey);
    try {
      const res = await addManagerNote(reason, "internal", false, gapKey);
      if (!res?.success) {
        addToast({ title: "Save Failed", message: res?.error || "Could not save the gap reason.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
        return;
      }
      setEditingGapKey(null);
      setGapReasonDraft("");
    } finally {
      setSavingGapKey(null);
    }
  };

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
      const confirmed = await confirm(
        `Current Start Inquiries is "${currentVal}". Recomputing from the saved report gives "${computed}". Overwrite?`
      );
      if (!confirmed) return;
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

      {(clientDates || client)?.is_paused && (
        <div className="px-4 py-3 d-flex align-items-start gap-2" style={{ backgroundColor: "rgba(245, 158, 11, 0.12)", borderBottom: `1px solid ${theme.border}` }}>
          <i className="bi bi-pause-circle-fill fs-4 flex-shrink-0" style={{ color: theme.warning }}></i>
          <div>
            <div className="fw-bold text-uppercase small" style={{ color: theme.warning, letterSpacing: '0.5px' }}>
              Service Paused
              {(clientDates || client)?.paused_at && (
                <span className="fw-normal text-uppercase ms-2" style={{ color: theme.textMuted, letterSpacing: 'normal' }}>
                  since {new Date((clientDates || client).paused_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            <div className="small" style={{ color: theme.textMain }}>{pauseReason || "No reason on file."}</div>
          </div>
        </div>
      )}

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
                            
                            {timelineWithGaps.map((step, idx) => (
                                <div key={idx} className="mb-4">
                                <div className="position-relative d-flex align-items-start">
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

                                {/* Gap indicator + reason editor, sitting between this step and the next */}
                                {step.gap && (
                                    <div className="position-relative mt-2" style={{ marginLeft: '35px', paddingLeft: '10px', borderLeft: `2px dashed ${theme.warning}` }}>
                                        <div className="d-flex align-items-center flex-wrap gap-2">
                                            <Badge bg="warning" text="dark" className="fw-bold" style={{ fontSize: '0.65rem' }}>
                                                <i className="bi bi-hourglass-split me-1"></i>{step.gap.days}d gap
                                            </Badge>
                                            {step.gap.note ? (
                                                <span className="small" style={{ color: theme.textMain }}>{step.gap.note.text}</span>
                                            ) : editingGapKey !== step.gap.key ? (
                                                notesMigrationMissing ? (
                                                    <span className="small fst-italic" style={{ color: theme.textMuted }}>Run the Manager Notes migration to add a reason</span>
                                                ) : (
                                                    <Button variant="link" size="sm" className="p-0" style={{ fontSize: '0.75rem' }} onClick={() => { setEditingGapKey(step.gap.key); setGapReasonDraft(""); }}>
                                                        + Add reason
                                                    </Button>
                                                )
                                            ) : null}
                                            {step.gap.note && !notesMigrationMissing && (
                                                <Button variant="link" size="sm" className="p-0 text-muted" title="Update reason" onClick={() => { setEditingGapKey(step.gap.key); setGapReasonDraft(step.gap.note.text); }}>
                                                    <i className="bi bi-pencil-fill" style={{ fontSize: '0.7rem' }}></i>
                                                </Button>
                                            )}
                                        </div>

                                        {editingGapKey === step.gap.key && (
                                            <div className="mt-2 d-flex flex-column gap-2" style={{ maxWidth: '320px' }}>
                                                <div className="d-flex flex-wrap gap-1">
                                                    {GAP_REASON_PRESETS.map((preset) => (
                                                        <Button
                                                            key={preset}
                                                            size="sm"
                                                            variant={gapReasonDraft === preset ? "info" : "outline-secondary"}
                                                            className="py-0 px-2"
                                                            style={{ fontSize: '0.7rem' }}
                                                            onClick={() => setGapReasonDraft(preset)}
                                                        >
                                                            {preset}
                                                        </Button>
                                                    ))}
                                                </div>
                                                <input
                                                    className="form-control form-control-sm"
                                                    style={{ backgroundColor: theme.headerBg, color: theme.textMain, borderColor: theme.border }}
                                                    placeholder="Or type a custom reason..."
                                                    value={gapReasonDraft}
                                                    onChange={(e) => setGapReasonDraft(e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' && gapReasonDraft.trim()) handleSaveGapReason(step.gap.key); }}
                                                    autoFocus
                                                />
                                                <div className="d-flex gap-2">
                                                    <Button size="sm" variant="success" disabled={!gapReasonDraft.trim() || savingGapKey === step.gap.key} onClick={() => handleSaveGapReason(step.gap.key)}>
                                                        {savingGapKey === step.gap.key ? <Spinner size="sm" /> : "Save"}
                                                    </Button>
                                                    <Button size="sm" variant="outline-secondary" onClick={() => { setEditingGapKey(null); setGapReasonDraft(""); }}>Cancel</Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
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