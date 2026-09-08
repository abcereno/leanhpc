import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import useAiReviewQueue from "../../hooks/useAiReviewQueue";
import { useToast } from "../shared/ui/ToastNotifier";

const STATUS_BADGE = {
  pending: <Badge bg="warning" text="dark">Pending</Badge>,
  resolved: <Badge bg="success">Resolved</Badge>,
  dismissed: <Badge bg="secondary">Dismissed</Badge>,
};

// The exact 3 strings supabase/functions/classify-inquiries/index.ts's
// guardReasonForLinked/applyDeterministicGuard can write to
// _classifierGuard — see that file's own comments for the full logic.
const REASON_LABELS = {
  downgraded_linked_unconfirmed_identity: "AI proposed Linked, but the matching account belongs to a lender that needs manual identity confirmation",
  downgraded_linked_failed_date_window: "AI proposed Linked, but the account didn't open within the expected window after the inquiry",
  downgraded_associated_failed_window: "AI proposed Associated, but the account didn't open within the expected 0-60 day window",
};

/**
 * The "AI needs help" escalation queue — separate from CountReviewQueue.jsx
 * (that's a supervisor approving a dispute COUNT; this is the classifier
 * itself flagging that its own linked/associated call got overridden by a
 * deterministic safety check, see sql/add_ai_review_queue.sql and
 * utils/aiReviewQueue.js). Gated at the route level (App.jsx) on
 * review_ai_flags; also checked here as defense-in-depth.
 *
 * Every guarded inquiry already landed "non-linked" automatically (the
 * guard already fixed the classification), so there's nothing to
 * approve/correct here the way Count Review has a number to accept — this
 * queue exists purely so staff notice the pattern (a lender that keeps
 * needing manual review, a client whose accounts keep failing the date
 * window) and can decide whether it's worth a closer look on that client's
 * thread. Resolve/Dismiss just clears it off the queue once looked at.
 */
export default function AiReviewQueue() {
  const { hasPermission } = useAuth();
  const canReview = hasPermission("review_ai_flags");
  const { flags, loading, error, resolveFlag, dismissFlag } = useAiReviewQueue();
  const { addToast } = useToast();

  const [statusFilter, setStatusFilter] = useState("pending");

  const counts = useMemo(() => {
    const c = { pending: 0, resolved: 0, dismissed: 0 };
    flags.forEach((f) => { if (c[f.status] !== undefined) c[f.status] += 1; });
    return c;
  }, [flags]);

  const visibleFlags = useMemo(() => {
    return flags.filter((f) => statusFilter === "all" || f.status === statusFilter);
  }, [flags, statusFilter]);

  const handleResolve = async (flag) => {
    const res = await resolveFlag(flag);
    if (!res.success) {
      addToast({ title: "Failed to Resolve", message: res.error || "Unknown error.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    addToast({ title: "Marked Resolved", message: `${flag.clients?.full_name || "Client"} — ${flag.bureau} flag cleared.`, variant: "success", icon: "bi-check-circle-fill" });
  };

  const handleDismiss = async (flag) => {
    const res = await dismissFlag(flag);
    if (!res.success) {
      addToast({ title: "Failed to Dismiss", message: res.error || "Unknown error.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    addToast({ title: "Dismissed", message: `${flag.clients?.full_name || "Client"} — ${flag.bureau} flag dismissed.`, variant: "secondary", icon: "bi-x-circle-fill" });
  };

  if (!canReview) {
    return (
      <Alert variant="warning" className="m-3">
        <i className="bi bi-shield-lock me-2"></i>
        You don't have the "Review AI Classification Flags" permission needed to view this queue.
      </Alert>
    );
  }

  return (
    <Card className="shadow-sm">
      <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h5 className="mb-0"><i className="bi bi-robot me-2"></i>AI Review Queue</h5>
        <div className="d-flex gap-2">
          {["pending", "resolved", "dismissed", "all"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "primary" : "outline-secondary"}
              onClick={() => setStatusFilter(s)}
            >
              {s[0].toUpperCase() + s.slice(1)}
              {s !== "all" && <Badge bg="light" text="dark" className="ms-2">{counts[s] ?? 0}</Badge>}
            </Button>
          ))}
        </div>
      </Card.Header>
      <Card.Body className="p-0">
        {error && <Alert variant="danger" className="m-3">{error} — has sql/add_ai_review_queue.sql been run yet?</Alert>}

        {loading ? (
          <div className="text-center py-5"><Spinner animation="border" /></div>
        ) : visibleFlags.length === 0 ? (
          <div className="text-center text-muted py-5">
            <i className="bi bi-inbox fs-1 d-block mb-2 opacity-50"></i>
            No {statusFilter !== "all" ? statusFilter : ""} AI review flags.
          </div>
        ) : (
          <Table responsive hover className="mb-0 align-middle">
            <thead className="text-muted">
              <tr>
                <th>Date Flagged</th>
                <th>Client</th>
                <th>Bureau</th>
                <th>Creditor</th>
                <th>Inquiry Date</th>
                <th>Why the AI wasn't sure</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleFlags.map((flag) => (
                <tr key={flag.id}>
                  <td className="text-nowrap">{new Date(flag.created_at).toLocaleDateString()}</td>
                  <td>
                    <Link to={`/clients/${flag.client_id}`} target="_blank" rel="noreferrer">
                      {flag.clients?.full_name || "Unknown Client"}
                    </Link>
                  </td>
                  <td>{flag.bureau}</td>
                  <td>{flag.creditor || <span className="text-muted">—</span>}</td>
                  <td>{flag.inquiry_date || <span className="text-muted">—</span>}</td>
                  <td className="small">
                    {STATUS_BADGE[flag.status]}{" "}
                    {REASON_LABELS[flag.guard_reason] || flag.guard_reason}
                  </td>
                  <td className="text-end text-nowrap" style={{ minWidth: 160 }}>
                    {flag.status === "pending" ? (
                      <div className="d-flex gap-2 justify-content-end">
                        <Button size="sm" variant="success" onClick={() => handleResolve(flag)}>Resolve</Button>
                        <Button size="sm" variant="outline-secondary" onClick={() => handleDismiss(flag)}>Dismiss</Button>
                      </div>
                    ) : (
                      <span className="text-muted small">
                        {flag.status === "resolved" ? "Resolved" : "Dismissed"}
                        {flag.resolved_at && ` ${new Date(flag.resolved_at).toLocaleDateString()}`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card.Body>
    </Card>
  );
}
