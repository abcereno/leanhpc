import { Badge, Button, Card } from "react-bootstrap";

// Excluded from this panel: "my_files" (a personal filter, not a fleet-wide
// action-required signal), "completed" (the opposite of action required),
// "active" (a general paid/not-completed status view, not itself an
// alert — it would just show the bulk of the paid client base at all
// times), and the per-service chips (service_* — which service a client is
// on isn't itself something needing action, just a category). Everything
// else in the shared registry shows here so the dashboard's counts and
// Production Queue's filter chips never drift out of sync — see
// utils/clientFlags.js.
const EXCLUDED_KEYS = new Set(["my_files", "completed", "active"]);
const isServiceChip = (key) => key.startsWith("service_");

/**
 * "Manager Attention / Action Required" panel. Reads counts from
 * useOpsFilters()'s shared filterCounts (same predicates the Production
 * Queue's filter chips use) so a number here always matches what you'd see
 * clicking through. Clicking a chip jumps to the Production Queue tab with
 * that filter pre-applied.
 */
export default function ActionRequired({ filterCounts, filterDefinitions, onSelectFilter, alertsSummary, loading }) {
  const chips = (filterDefinitions || []).filter((f) => !EXCLUDED_KEYS.has(f.key) && !isServiceChip(f.key));

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Header className="bg-transparent border-0 pt-3 pb-0">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h6 className="text-uppercase text-muted fw-bold small mb-0">Action Required</h6>
          {alertsSummary && (
            <div className="small text-muted">
              <Badge bg="warning" text="dark" className="me-1">{alertsSummary.dueCount} due</Badge>
              <Badge bg="danger">{alertsSummary.overdueCount} overdue</Badge>
            </div>
          )}
        </div>
      </Card.Header>
      <Card.Body className="pt-2">
        {loading ? (
          <div className="text-muted small">Loading…</div>
        ) : (
          <div className="action-required-grid">
            {chips.map((f) => {
              const count = filterCounts?.[f.key] ?? 0;
              return (
                <Button
                  key={f.key}
                  variant={count > 0 ? "outline-danger" : "outline-secondary"}
                  className="action-required-tile w-100 d-flex flex-column"
                  onClick={() => onSelectFilter?.(f.key)}
                >
                  <span className="action-required-tile-count">{count}</span>
                  <span className="action-required-tile-label">{f.label}</span>
                </Button>
              );
            })}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
