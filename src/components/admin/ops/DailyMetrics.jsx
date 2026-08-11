import { Card, Col, Row } from "react-bootstrap";

const CARDS = [
  { key: "newClients", label: "New Clients", icon: "bi-person-plus", color: "primary" },
  { key: "payments", label: "Payments", icon: "bi-currency-dollar", color: "success" },
  { key: "experianCalls", label: "Experian Calls", icon: "bi-telephone", color: "info" },
  { key: "tuSubmissions", label: "TU Submissions", icon: "bi-send", color: "info" },
  { key: "eqSubmissions", label: "EQ Submissions", icon: "bi-send", color: "info" },
  { key: "completed", label: "Completed", icon: "bi-check2-circle", color: "success" },
  { key: "avgProcessingDays", label: "Avg Processing (d)", icon: "bi-stopwatch", color: "warning" },
];

/**
 * Activity cards, output of hooks/useDailyMetrics.js. Sits alongside
 * Company Snapshot on the Overview tab. Every card except "Avg Processing"
 * reflects whatever date range was passed into useDailyMetrics() (defaults
 * to "today" if none is given — see the hook) — `rangeLabel` is just the
 * human-readable description of that range for the section header.
 */
export default function DailyMetrics({ metrics, scopeLabel, rangeLabel = "Today" }) {
  return (
    <div className="mb-4">
      <h6 className="text-uppercase text-muted fw-bold small mb-3">
        {scopeLabel ? `${scopeLabel} — ${rangeLabel}` : rangeLabel}
      </h6>
      <Row className="g-3">
        {CARDS.map((c) => (
          <Col key={c.key} xs={6} md={4} xl={2}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Body className="text-center py-3">
                <i className={`bi ${c.icon} text-${c.color} fs-4 mb-2 d-block`}></i>
                <div className="fs-4 fw-bold">{metrics?.[c.key] ?? 0}</div>
                <div className="text-muted small">{c.label}</div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
