import { Card, Col, Row } from "react-bootstrap";

const CARDS = [
  { key: "activePartners", label: "Active Partners", icon: "bi-diagram-3", color: "primary" },
  { key: "activeClients", label: "Active Clients", icon: "bi-people", color: "info" },
  { key: "filesProcessing", label: "Files Processing", icon: "bi-gear-wide-connected", color: "warning" },
  { key: "readyToComplete", label: "Ready to Complete", icon: "bi-check2-circle", color: "success" },
  { key: "completedInRange", label: "Completed (Range)", icon: "bi-calendar-check", color: "success" },
  { key: "newClientsInRange", label: "New Clients (Range)", icon: "bi-person-plus", color: "primary" },
];

/**
 * Large summary cards for the top of the Operations Dashboard.
 * `metrics` is the output of utils/opsMetrics.js#computeCompanySnapshot.
 * `hiddenKeys` lets a scoped view (e.g. an individual employee) drop cards
 * that don't make sense outside a company-wide context, without forking
 * this component.
 *
 * "Completed (Range)" / "New Clients (Range)" reflect whatever date range
 * was passed into computeCompanySnapshot() — everything else here is a
 * current-state count and ignores the date range entirely.
 */
export default function CompanySnapshot({ metrics, scopeLabel, hiddenKeys = [] }) {
  const cards = CARDS.filter((c) => !hiddenKeys.includes(c.key));

  return (
    <div className="mb-4">
      <h6 className="text-uppercase text-muted fw-bold small mb-3">
        {scopeLabel || "Company Snapshot"}
      </h6>
      <Row className="g-3">
        {cards.map((c) => (
          <Col key={c.key} xs={6} md={4} xl={2}>
            <Card className="border-0 shadow-sm h-100">
              <Card.Body className="text-center py-4">
                <i className={`bi ${c.icon} text-${c.color} fs-3 mb-2 d-block`}></i>
                <div className="fs-2 fw-bold">{metrics[c.key] ?? 0}</div>
                <div className="text-muted small">{c.label}</div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
