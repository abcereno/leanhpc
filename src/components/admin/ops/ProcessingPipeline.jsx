import { useMemo, useState } from "react";
import { Badge, Form, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import { useToast } from "../../shared/ui/ToastNotifier";
import { PROCESSING_STAGES } from "../../../utils/processingStage";

// A dedicated kanban board for the manually-selected `processing_stage`
// (see utils/processingStage.js) — separate from WorkflowPipeline.jsx's
// "Pipeline" tab, which tracks the auto-derived per-bureau docs/calls
// workflow stage and is click-to-filter, not drag-to-set. This one exists
// specifically so staff can set/move many clients' processing stage at a
// glance instead of opening each client's profile modal one at a time.
//
// No drag-and-drop library — this app has none installed and npm install
// isn't reliably available in every environment this runs in, so this uses
// the native HTML5 Drag and Drop API directly (draggable + onDragStart/
// onDragOver/onDrop). One column ("Not Started") is a sentinel for
// processing_stage IS NULL — dropping a card there clears the column back
// to null rather than storing a 6th fake enum value.
//
// Scope: paid, not-yet-complete clients only (same "is this file actually
// in the processing phase" logic as ClientSummaryModal.jsx's Processing
// timeline step, minus the firstCommentDate lookup — that's a per-client
// call_logs query not worth doing fleet-wide just to decide board
// membership; is_paid + progress<100 is close enough for a triage board).

const UNSET = "__unset__";

const COLUMNS = [
  { id: UNSET, label: "Not Started", icon: "bi-circle" },
  ...PROCESSING_STAGES.map((s) => ({ id: s.id, label: s.label, icon: "bi-arrow-right-circle" })),
];

export default function ProcessingPipeline({ clients, companies, scopeLabel }) {
  const { addToast } = useToast();
  const [companyFilter, setCompanyFilter] = useState("all");
  // Optimistic local overrides so a drag-drop shows instantly without
  // waiting on the parent's next full ops-data reload. { [clientId]: stageIdOrUNSET }
  const [stageOverrides, setStageOverrides] = useState({});
  const [savingIds, setSavingIds] = useState(new Set());
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const sortedCompanies = useMemo(
    () => [...(companies || [])].sort((a, b) => (a.company_name || "").localeCompare(b.company_name || "")),
    [companies]
  );

  const board = useMemo(() => {
    const pool = (clients || []).filter((c) => c.is_paid && Number(c.progress || 0) < 100);
    const narrowed = companyFilter === "all" ? pool : pool.filter((c) => String(c.company_id) === String(companyFilter));

    const byColumn = {};
    COLUMNS.forEach((col) => { byColumn[col.id] = []; });

    narrowed.forEach((c) => {
      const effectiveStage = stageOverrides[c.id] !== undefined ? stageOverrides[c.id] : (c.processing_stage || UNSET);
      const key = byColumn[effectiveStage] ? effectiveStage : UNSET; // unrecognized/stale value falls back to Not Started rather than vanishing
      byColumn[key].push(c);
    });

    return byColumn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, companyFilter, stageOverrides]);

  const handleDrop = async (columnId, clientId) => {
    setDragOverColumn(null);
    if (!clientId) return;

    const current = clients.find((c) => c.id === clientId);
    const currentEffective = stageOverrides[clientId] !== undefined ? stageOverrides[clientId] : (current?.processing_stage || UNSET);
    if (currentEffective === columnId) return; // dropped back into its own column

    const nextValue = columnId === UNSET ? null : columnId;
    const previousOverride = stageOverrides[clientId];

    setStageOverrides((prev) => ({ ...prev, [clientId]: columnId }));
    setSavingIds((prev) => new Set(prev).add(clientId));

    try {
      const { error } = await supabase
        .from("clients")
        .update({ processing_stage: nextValue, processing_stage_updated_at: new Date().toISOString() })
        .eq("id", clientId);
      if (error) throw error;
    } catch (err) {
      // Revert the optimistic move on failure.
      setStageOverrides((prev) => {
        const next = { ...prev };
        if (previousOverride === undefined) delete next[clientId];
        else next[clientId] = previousOverride;
        return next;
      });
      addToast({
        title: "Move Failed",
        message: "Could not save the stage change (run sql/add_processing_stage.sql if it hasn't been run yet): " + err.message,
        variant: "danger",
        icon: "bi-exclamation-triangle-fill",
      });
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(clientId);
        return next;
      });
    }
  };

  const totalOnBoard = COLUMNS.reduce((sum, col) => sum + (board[col.id]?.length || 0), 0);

  return (
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white d-flex align-items-center justify-content-between py-3 flex-wrap gap-2">
        <strong className="text-primary"><i className="bi bi-kanban-fill me-2"></i>Processing Pipeline</strong>
        <span className="text-muted small">{scopeLabel} — {totalOnBoard} paid, in-progress client(s) — drag a card to change its stage</span>
      </div>
      <div className="card-body">
        {sortedCompanies.length > 0 && (
          <div className="d-flex flex-wrap align-items-end gap-3 mb-3">
            <Form.Group>
              <Form.Label className="small fw-bold text-muted mb-1">Company</Form.Label>
              <Form.Select size="sm" style={{ minWidth: 200 }} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
                <option value="all">All Companies</option>
                {sortedCompanies.map((co) => (
                  <option key={co.id} value={co.id}>{co.company_name}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </div>
        )}

        {totalOnBoard === 0 ? (
          <div className="text-center text-muted py-5">
            <i className="bi bi-inbox fs-1 d-block mb-2 opacity-50"></i>
            No paid, in-progress clients right now.
          </div>
        ) : (
          <div className="d-flex gap-3 overflow-auto pb-2">
            {COLUMNS.map((col) => (
              <div
                key={col.id}
                className="flex-shrink-0 rounded-3 p-2"
                style={{
                  width: 240,
                  backgroundColor: dragOverColumn === col.id ? "#e7f1ff" : "#f8f9fa",
                  border: dragOverColumn === col.id ? "2px dashed #0d6efd" : "1px solid #e9ecef",
                  transition: "background-color 0.1s",
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOverColumn(col.id); }}
                onDragLeave={() => setDragOverColumn((prev) => (prev === col.id ? null : prev))}
                onDrop={(e) => { e.preventDefault(); handleDrop(col.id, e.dataTransfer.getData("text/plain")); }}
              >
                <div className="d-flex align-items-center justify-content-between px-1 mb-2">
                  <span className="small fw-bold text-uppercase text-muted" style={{ fontSize: "0.7rem", letterSpacing: "0.5px" }}>
                    <i className={`bi ${col.icon} me-1`}></i>{col.label}
                  </span>
                  <Badge bg="secondary" className="fw-normal">{board[col.id]?.length || 0}</Badge>
                </div>
                <div className="d-flex flex-column gap-2" style={{ minHeight: 60 }}>
                  {(board[col.id] || []).map((c) => (
                    <PipelineCard key={c.id} client={c} saving={savingIds.has(c.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineCard({ client, saving }) {
  return (
    <div
      draggable={!saving}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", client.id)}
      className="bg-white rounded-3 shadow-sm p-2 position-relative"
      style={{ border: "1px solid #dee2e6", cursor: saving ? "wait" : "grab", opacity: saving ? 0.6 : 1 }}
    >
      {saving && (
        <div className="position-absolute top-0 end-0 p-1">
          <Spinner animation="border" size="sm" />
        </div>
      )}
      <Link to={`/clients/${client.id}`} className="d-block fw-bold text-dark text-decoration-none text-truncate" style={{ fontSize: "0.85rem" }} title={client.full_name}>
        {client.full_name || "Unnamed Client"}
      </Link>
      <div className="small text-muted text-truncate" style={{ fontSize: "0.72rem" }}>
        {client.companies?.company_name || "No Partner"}
      </div>
      <div className="d-flex align-items-center justify-content-between mt-1">
        <Badge bg="info" text="dark" className="fw-normal" style={{ fontSize: "0.65rem" }}>{Math.round(Number(client.progress || 0))}%</Badge>
        {client.processing_stage_updated_at && (
          <small className="text-muted" style={{ fontSize: "0.62rem" }}>
            {new Date(client.processing_stage_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </small>
        )}
      </div>
    </div>
  );
}
