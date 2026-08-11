import { useMemo, useState } from "react";
import { Button, Form } from "react-bootstrap";
import { summarizePipeline, STAGE_BADGE_STYLE } from "../../../utils/workflowStage";
import { FILTER_DEFINITIONS } from "../../../utils/clientFlags";
import { matchesClientSearch } from "../../../utils/searchClients";
import useDateRange from "../../../hooks/useDateRange";
import DateRangeFilter from "./DateRangeFilter";
import ClientCardGrid from "./ClientCardGrid";
import ProductionQueueLegend from "./ProductionQueueLegend";

// Maps a stage from utils/workflowStage.js's PIPELINE_STAGES to the
// merged filter key that shows that bucket regardless of which bureau
// it's for (utils/clientFlags.js's `pipeline_all_*` entries — a client
// matches if EITHER their EXP lane or their TU/EQ lane is at that stage).
function filterKeyFor(stageKey) {
  return `pipeline_all_${stageKey}`;
}

/**
 * "Where are clients sitting on the workflow right now" — an aggregate,
 * fleet-wide view of the same Docs → Waiting → Ready → Calls → Completed
 * pipeline utils/workflowStage.js already computes per client for
 * ProductionQueue.jsx's badges. Experian and TU/EQ used to be shown as two
 * separate rows (Experian was callable immediately, no docs wait), but
 * both now run the identical docs-round + 7-day-wait cycle — see
 * workflowStage.js's computeDocsGatedStage — so there's nothing left to
 * split into two rows; this shows one merged row of stage counts across
 * all three bureaus.
 *
 * Company + date-range + search filters narrow both the tile counts and
 * the drill-down list the same way ProductionQueue.jsx's do (see that
 * component's own header comment on `dateNarrowedPool` — counts and the
 * rendered list have to agree on the same pool, or a badge can show a
 * number the list underneath doesn't actually back up).
 *
 * Clicking a stage tile shows the matching clients right here (via
 * ClientCardGrid, same card used by Production Queue) instead of jumping
 * to a different tab — the predicate is looked up from the exact same
 * utils/clientFlags.js FILTER_DEFINITIONS entry the tile's own count was
 * computed from, so the two can never disagree. A client is counted (and
 * shown) once per stage even if both their EXP and TU/EQ lane happen to
 * be at that same stage — see summarizePipeline's `all` for why.
 */
export default function WorkflowPipeline({ clients, companies, scopeLabel }) {
  const [companyFilter, setCompanyFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState(null); // { key, label, filterKey } | null
  const pipelineDateRange = useDateRange({ defaultRange: "empty" });

  const sortedCompanies = useMemo(
    () => [...(companies || [])].sort((a, b) => (a.company_name || "").localeCompare(b.company_name || "")),
    [companies]
  );

  const byCompany = (list) =>
    companyFilter === "all" ? list : list.filter((c) => String(c.company_id) === String(companyFilter));

  // Same pool the tile counts AND the drill-down list both read from —
  // company + date narrowed, nothing else yet (search only applies to the
  // drill-down list below, matching how Production Queue's search box
  // never affects its chip counts either).
  const scopedPool = useMemo(() => {
    const narrowed = byCompany(clients || []);
    return pipelineDateRange.isActive ? narrowed.filter((c) => pipelineDateRange.inRange(c.created_at)) : narrowed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, companyFilter, pipelineDateRange.from, pipelineDateRange.to]);

  const { all } = useMemo(() => summarizePipeline(scopedPool), [scopedPool]);

  const drilldownList = useMemo(() => {
    if (!selectedStage) return [];
    const def = FILTER_DEFINITIONS.find((f) => f.key === selectedStage.filterKey);
    if (!def) return [];
    const matched = scopedPool.filter((c) => def.predicate(c, {}));
    return search.trim() ? matched.filter((c) => matchesClientSearch(c, search)) : matched;
  }, [scopedPool, selectedStage, search]);

  function handleSelectStage(stage) {
    const filterKey = filterKeyFor(stage.key);
    setSelectedStage((prev) =>
      prev && prev.key === stage.key
        ? null // clicking the already-selected stage again clears it
        : { key: stage.key, label: stage.label, filterKey }
    );
  }

  return (
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white d-flex align-items-center justify-content-between py-3">
        <strong className="text-primary"><i className="bi bi-signpost-split-fill me-2"></i>Workflow Pipeline</strong>
        <div className="d-flex align-items-center gap-3">
          <span className="text-muted small">{scopeLabel} — click a stage to see those clients</span>
          <ProductionQueueLegend title="Pipeline Tag Guide" />
        </div>
      </div>
      <div className="card-body">
        <div className="d-flex flex-wrap align-items-end gap-3 mb-3">
          <DateRangeFilter
            from={pipelineDateRange.from}
            to={pipelineDateRange.to}
            setFrom={pipelineDateRange.setFrom}
            setTo={pipelineDateRange.setTo}
            onClear={pipelineDateRange.clear}
            label="Date Created"
          />
          {sortedCompanies.length > 0 && (
            <Form.Group>
              <Form.Label className="small fw-bold text-muted mb-1">Company</Form.Label>
              <Form.Select size="sm" style={{ minWidth: 200 }} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
                <option value="all">All Companies</option>
                {sortedCompanies.map((co) => (
                  <option key={co.id} value={co.id}>{co.company_name}</option>
                ))}
              </Form.Select>
            </Form.Group>
          )}
        </div>

        <PipelineLane stages={all} selectedStage={selectedStage} onSelectStage={handleSelectStage} />

        {selectedStage && (
          <div className="mt-4 pt-3 border-top">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div>
                <strong>{selectedStage.label}</strong>
                <span className="text-muted small ms-2">{drilldownList.length} client(s)</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <Form.Control
                  size="sm"
                  style={{ maxWidth: 260 }}
                  placeholder="Search name, email, phone, partner…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button size="sm" variant="outline-secondary" onClick={() => setSelectedStage(null)}>
                  <i className="bi bi-x-lg"></i>
                </Button>
              </div>
            </div>
            <ClientCardGrid clients={drilldownList} emptyMessage="No clients in this stage right now." />
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineLane({ stages, selectedStage, onSelectStage }) {
  return (
    <div>
      <div className="d-flex flex-wrap align-items-stretch gap-2">
        {stages.map((stage, i) => (
          <div key={stage.key} className="d-flex align-items-stretch gap-2">
            <StageTile
              stage={stage}
              selected={selectedStage?.key === stage.key}
              onClick={() => onSelectStage(stage)}
            />
            {i < stages.length - 1 && (
              <div className="d-flex align-items-center text-muted opacity-50">
                <i className="bi bi-chevron-right"></i>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Fixed, non-theme-reactive colors — see STAGE_BADGE_STYLE's own comment in
// workflowStage.js for why: this card is always a light/white tile
// regardless of the app's light/dark mode, so it can't rely on Bootstrap's
// `text-*`/`var(--bs-*)` utilities, which this app's dark-mode toggle
// re-maps to light colors meant for a dark background — that was making a
// populated "In Call Queue" tile (type "calls") render its count in pale,
// low-contrast text, indistinguishable from an actually-empty tile.
const EMPTY_HEX = "#adb5bd";

function StageTile({ stage, selected, onClick }) {
  const style = STAGE_BADGE_STYLE[stage.type] || {};
  const isEmpty = !stage.count;
  const hex = isEmpty ? EMPTY_HEX : style.hex || "#495057";
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn text-start p-2 border-0"
      disabled={isEmpty}
      title={isEmpty ? "No clients in this stage right now" : `Show these ${stage.count} client(s)`}
      style={{
        minWidth: 120,
        borderRadius: 10,
        backgroundColor: isEmpty ? "#f1f3f5" : "#ffffff",
        boxShadow: selected ? `0 0 0 2px ${hex}` : isEmpty ? "none" : "0 1px 3px rgba(0,0,0,0.08)",
        border: `1px solid ${hex}`,
        opacity: isEmpty ? 0.7 : 1,
        cursor: isEmpty ? "default" : "pointer",
      }}
    >
      <div className="fs-4 fw-bold" style={{ color: hex }}>{stage.count}</div>
      <div className="extra-small d-flex align-items-center gap-1" style={{ color: "#495057" }}>
        <i className={`bi ${style.icon || "bi-circle"}`}></i>
        {stage.label}
      </div>
    </button>
  );
}
