import { OverlayTrigger, Tooltip } from "react-bootstrap";

const PENALTY_LABELS = {
  overThirtyDays: "Files over 30 days",
  missingDocuments: "Missing documents",
  internalIssues: "Internal issues (open tasks)",
  unassignedFiles: "Unassigned files",
  slowProcessing: "Slow average processing time",
};

/**
 * Single-number "Operations Health Score" (0-100). Weighting is a
 * first-pass guess (see utils/opsMetrics.js#computeHealthScore) — flagged
 * to the user in the tooltip footer since it hasn't been confirmed with
 * Bernard yet.
 */
export default function HealthScoreBadge({ score, penalties, avgProcessingDays }) {
  const variant = score >= 80 ? "success" : score >= 60 ? "warning" : "danger";
  const colorMap = { success: "#198754", warning: "#fd7e14", danger: "#dc3545" };

  const tooltip = (
    <Tooltip>
      <div className="text-start">
        <strong>Deductions</strong>
        <ul className="ps-3 mb-2">
          {Object.entries(penalties || {}).map(([key, val]) => (
            <li key={key}>
              {PENALTY_LABELS[key] || key}: -{val}
            </li>
          ))}
        </ul>
        <div className="small">Avg processing: {avgProcessingDays}d</div>
        <div className="small fst-italic mt-1">
          First-pass weighting, not yet confirmed with Bernard.
        </div>
      </div>
    </Tooltip>
  );

  return (
    <OverlayTrigger placement="left" overlay={tooltip}>
      <div
        role="button"
        className="d-flex align-items-center gap-2 border rounded-pill px-3 py-1 shadow-sm bg-white"
        style={{ cursor: "default" }}
      >
        <div
          className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white"
          style={{ width: 32, height: 32, backgroundColor: colorMap[variant], fontSize: "0.85rem" }}
        >
          {score}
        </div>
        <span className="small fw-semibold text-muted text-uppercase">Health Score</span>
      </div>
    </OverlayTrigger>
  );
}
