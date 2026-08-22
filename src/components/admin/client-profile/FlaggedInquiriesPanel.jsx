// src/components/admin/client-profile/FlaggedInquiriesPanel.jsx
//
// Classic Report improvement #4 — the admin-facing half of "link No-Match
// inquiries into the dispute workflow." A client viewing their Classic
// Report (/classic-report/:token) can flag inquiries they don't recognize
// (see useInquiryFlags.js's submitInquiryFlags, called from
// ClassicReportPage.jsx). This panel is where that queue surfaces for a
// human to act on — same Card/Badge shape as AlignmentCheckPanel.jsx, right
// below it on the Workspace tab (ClientProfile.jsx).
//
// Deliberately read-only against thread.json: marking a flag "Reviewed"
// here does NOT reclassify anything in the dispute thread below — the admin
// still does that themselves in InquiriesThread, same as always. This panel
// only answers "did the client tell us something we should look at."
import { Card, Badge, Button, Spinner } from "react-bootstrap";
import { useFlaggedInquiries } from "../../../hooks/useInquiryFlags";

const BUREAU_LABEL = { TU: "TransUnion", EX: "Experian", EQ: "Equifax" };

export default function FlaggedInquiriesPanel({ clientId, refreshKey }) {
  const { flags, loading, migrationMissing, actingId, pendingCount, markReviewed, dismiss } = useFlaggedInquiries(clientId, refreshKey);

  if (migrationMissing) {
    return (
      <Card className="border-warning">
        <Card.Body className="small text-muted">
          <i className="bi bi-exclamation-triangle-fill text-warning me-2" />
          Flagged Inquiries needs <code>sql/add_inquiry_flags.sql</code> run against this database.
        </Card.Body>
      </Card>
    );
  }

  if (!loading && flags.length === 0) return null; // nothing flagged, don't clutter the tab

  return (
    <Card className="shadow-sm border">
      <Card.Header className="bg-white d-flex align-items-center justify-content-between">
        <span className="fw-bold">
          <i className="bi bi-flag me-2 text-primary" />
          Flagged Inquiries
        </span>
        {pendingCount > 0 ? (
          <Badge bg="warning" text="dark" className="fw-normal">{pendingCount} pending</Badge>
        ) : (
          <Badge bg="success" className="fw-normal">All reviewed</Badge>
        )}
      </Card.Header>
      <Card.Body>
        {loading ? (
          <div className="text-center py-3"><Spinner size="sm" /></div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {flags.map((f) => (
              <div key={f.id} className="d-flex align-items-center justify-content-between border-bottom pb-2">
                <div>
                  <div className="fw-semibold small">{f.creditor}</div>
                  <div className="text-muted small">
                    {BUREAU_LABEL[f.bureau] || f.bureau} · {f.inquiry_date || "no date"} · flagged {new Date(f.created_at).toLocaleDateString()}
                  </div>
                </div>
                {f.status === "pending" ? (
                  <div className="d-flex gap-2">
                    <Button size="sm" variant="outline-secondary" disabled={actingId === f.id} onClick={() => dismiss(f.id)}>
                      {actingId === f.id ? <Spinner size="sm" /> : "Dismiss"}
                    </Button>
                    <Button size="sm" variant="outline-success" disabled={actingId === f.id} onClick={() => markReviewed(f.id)}>
                      {actingId === f.id ? <Spinner size="sm" /> : "Mark Reviewed"}
                    </Button>
                  </div>
                ) : (
                  <Badge bg={f.status === "reviewed" ? "success" : "secondary"} className="fw-normal text-capitalize">{f.status}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
