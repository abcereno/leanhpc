import { useMemo, useState } from "react";
import { Card, ButtonGroup, Button, Badge } from "react-bootstrap";
import { Link } from "react-router-dom";
import { AGING_BUCKETS } from "../../../utils/aging";
import { bucketClientsByAging } from "../../../utils/opsMetrics";

/**
 * Colored-circle aging view (0-14 / 15-19 / 20-29 / 30+ business days).
 * Two modes, toggled at the top:
 *  - "processing": paid, not-yet-completed files, aged since paid_at
 *  - "unpaid": not-yet-paid clients, aged since created_at
 * Clicking a circle expands an inline drilldown list (click again to close)
 * rather than navigating away, so managers can scan multiple buckets fast.
 */
export default function AgingDashboard({ clients, scopeLabel }) {
  const [mode, setMode] = useState("processing");
  const [openBucket, setOpenBucket] = useState(null);

  const buckets = useMemo(() => bucketClientsByAging(clients, mode), [clients, mode]);
  const activeList = openBucket ? buckets[openBucket] || [] : [];
  const openBucketMeta = AGING_BUCKETS.find((b) => b.key === openBucket);

  return (
    <div className="mb-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-3 gap-2">
        <h6 className="text-uppercase text-muted fw-bold small mb-0">
          {scopeLabel ? `${scopeLabel} — Aging` : "Aging Dashboard"}
        </h6>
        <ButtonGroup size="sm">
          <Button
            variant={mode === "processing" ? "primary" : "outline-light"}
            className={mode === "processing" ? "" : "cmd-btn"}
            onClick={() => {
              setMode("processing");
              setOpenBucket(null);
            }}
          >
            In Production (Paid)
          </Button>
          <Button
            variant={mode === "unpaid" ? "primary" : "outline-light"}
            className={mode === "unpaid" ? "" : "cmd-btn"}
            onClick={() => {
              setMode("unpaid");
              setOpenBucket(null);
            }}
          >
            Awaiting Payment
          </Button>
        </ButtonGroup>
      </div>

      <div className="d-flex flex-wrap gap-3">
        {AGING_BUCKETS.map((b) => {
          const list = buckets[b.key] || [];
          const isOpen = openBucket === b.key;
          return (
            <Card
              key={b.key}
              role="button"
              tabIndex={0}
              onClick={() => setOpenBucket(isOpen ? null : b.key)}
              className="border-0 shadow-sm text-center"
              style={{
                minWidth: 150,
                flex: "1 1 150px",
                cursor: "pointer",
                outline: isOpen ? `2px solid ${b.color}` : "none",
              }}
            >
              <Card.Body className="py-4">
                <div
                  className="rounded-circle mx-auto mb-2 d-flex align-items-center justify-content-center fw-bold"
                  style={{
                    width: 56,
                    height: 56,
                    backgroundColor: b.bg,
                    color: b.color,
                    fontSize: "1.25rem",
                  }}
                >
                  {list.length}
                </div>
                <div className="small fw-semibold">
                  {b.emoji} {b.label}
                </div>
              </Card.Body>
            </Card>
          );
        })}
      </div>

      {openBucket && (
        <Card className="border-0 shadow-sm mt-3">
          <Card.Body>
            <div className="d-flex align-items-center justify-content-between mb-2">
              <strong className="small text-uppercase text-muted">
                {openBucketMeta?.label} — {activeList.length} file
                {activeList.length === 1 ? "" : "s"}
              </strong>
              <Button
                size="sm"
                variant="link"
                className="text-decoration-none"
                onClick={() => setOpenBucket(null)}
              >
                Close
              </Button>
            </div>
            {activeList.length === 0 ? (
              <div className="text-muted small">No files in this range.</div>
            ) : (
              <div className="list-group list-group-flush">
                {[...activeList]
                  .sort((a, b2) => b2.agingDays - a.agingDays)
                  .map((c) => (
                    <Link
                      key={c.id}
                      to={`/clients/${c.id}`}
                      className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                    >
                      <span>
                        {c.full_name || "Unnamed Client"}
                        {c.companies?.company_name && (
                          <span className="text-muted small ms-2">· {c.companies.company_name}</span>
                        )}
                      </span>
                      <Badge bg="secondary" pill>
                        {c.agingDays}d
                      </Badge>
                    </Link>
                  ))}
              </div>
            )}
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
