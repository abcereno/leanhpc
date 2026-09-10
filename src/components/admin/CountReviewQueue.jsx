import { useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Form, Modal, Spinner, Table } from "react-bootstrap";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import useCountReviews from "../../hooks/useCountReviews";
import { isLargeCountDifference } from "../../utils/inquiryCounts";
import { useToast } from "../shared/ui/ToastNotifier";
import { useConfirm } from "../shared/ui/ConfirmDialog";

const BUREAUS = ["Experian", "TransUnion", "Equifax"];

const STATUS_BADGE = {
  pending: <Badge bg="warning" text="dark">Pending</Badge>,
  approved: <Badge bg="success">Approved</Badge>,
  denied: <Badge bg="secondary">Denied</Badge>,
};

const REASON_LABELS = {
  ocr_error: "OCR misread the report",
  linked_inquiries: "Some inquiries are actually linked accounts",
  duplicate_inquiries: "Duplicate inquiries counted twice",
  updated_report: "Client provided an updated report",
  other: "Other",
  // Automatic — queued by every classification save an employee without
  // approve_count_reviews makes (see useInquiriesThread.js). The manual
  // reason-picker modal this used to require has been removed.
  classification_save: "Routine classification update",
};

/**
 * HPC Ops Sprint Priority 2 — the supervisor-facing approval queue for
 * count_review_requests (see sql/count_review.sql, sql/count_review_v2.sql,
 * useInquiriesThread.js's saveUpdatedThread/syncCountReviewRequests). Every
 * save an employee without approve_count_reviews makes now automatically
 * queues/refreshes a pending request here for any bureau with Non-Linked/
 * Associated/Dispute items — no employee-facing modal anymore. Gated at the
 * route level (App.jsx) on the approve_count_reviews permission; also
 * checked here as defense-in-depth since this writes
 * clients.approved_{bureau}_count.
 *
 * One row per CLIENT (not per client+bureau) — a client with pending
 * Experian/TransUnion/Equifax requests used to need three separate
 * Review clicks and three separate modals; now one "Review" opens a single
 * modal with all of that client's bureau counts together, submitted with
 * one Approve action. The modal always shows the client's full picture
 * across ALL statuses (not just whatever tab is active), so an
 * already-approved bureau can be edited right alongside a still-pending one
 * — useCountReviews.js's approveRequest() never gated on current status, it
 * just needed a UI path to reach it for a non-pending row.
 */
export default function CountReviewQueue() {
  const { hasPermission } = useAuth();
  const canApprove = hasPermission("approve_count_reviews");
  const { requests, loading, error, approveRequest, denyRequest } = useCountReviews();
  const { addToast } = useToast();
  const { confirm } = useConfirm();

  const [statusFilter, setStatusFilter] = useState("pending");
  const [reviewingClientId, setReviewingClientId] = useState(null);
  const [approvedCounts, setApprovedCounts] = useState({}); // { [bureau]: string }
  const [initials, setInitials] = useState("");
  const [largeDiffConfirmed, setLargeDiffConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [invoiceNudge, setInvoiceNudge] = useState(null); // { clientId, clientName } after an approval with a paid invoice

  // Every request for every client, regardless of the active tab — the
  // modal always edits from this full set so a bureau outside the current
  // status filter is never accidentally hidden from the supervisor.
  const requestsByClient = useMemo(() => {
    const map = new Map();
    requests.forEach((r) => {
      if (!map.has(r.client_id)) map.set(r.client_id, []);
      map.get(r.client_id).push(r);
    });
    return map;
  }, [requests]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, denied: 0 };
    requests.forEach((r) => { if (c[r.status] !== undefined) c[r.status] += 1; });
    return c;
  }, [requests]);

  // Which clients show up under the active tab: "all" shows every client
  // with at least one request; other tabs only show a client if at least
  // one of their bureau requests currently has that status (matches the old
  // per-row filtering behavior, just rolled up to the client level).
  const visibleClientRows = useMemo(() => {
    const rows = [];
    requestsByClient.forEach((clientRequests, clientId) => {
      const matches = statusFilter === "all" || clientRequests.some((r) => r.status === statusFilter);
      if (!matches) return;
      const mostRecent = clientRequests.reduce((a, b) => (new Date(b.created_at) > new Date(a.created_at) ? b : a));
      rows.push({
        clientId,
        clientName: mostRecent.clients?.full_name || "Unknown Client",
        mostRecentAt: mostRecent.created_at,
        requests: clientRequests,
      });
    });
    rows.sort((a, b) => new Date(b.mostRecentAt) - new Date(a.mostRecentAt));
    return rows;
  }, [requestsByClient, statusFilter]);

  const reviewingRows = reviewingClientId ? requestsByClient.get(reviewingClientId) || [] : [];
  const reviewingClientName = reviewingRows[0]?.clients?.full_name || "Client";
  const rowsByBureau = useMemo(() => {
    const map = {};
    reviewingRows.forEach((r) => { map[r.bureau] = r; });
    return map;
  }, [reviewingRows]);

  // The count a bureau is currently "at" — the pending ai_count, or the
  // last approved amount if it's already been approved once.
  const currentEffectiveValue = (row) =>
    row.status === "approved" ? row.count_review_approvals?.[0]?.approved_count ?? row.ai_count : row.ai_count;

  const openReview = (clientId) => {
    const rows = requestsByClient.get(clientId) || [];
    const initialCounts = {};
    rows.forEach((r) => {
      if (r.status !== "denied") initialCounts[r.bureau] = String(currentEffectiveValue(r));
    });
    setReviewingClientId(clientId);
    setApprovedCounts(initialCounts);
    setInitials("");
    setLargeDiffConfirmed(false);
    setModalError(null);
  };

  const closeReview = () => setReviewingClientId(null);

  // Which bureaus in the modal have a large enough change to require the
  // confirm checkbox — checked across every editable bureau at once so one
  // shared checkbox covers the whole submission (simpler than a checkbox
  // per bureau for what's usually a 1-3 field form).
  const largeDiffBureaus = BUREAUS.filter((bureau) => {
    const row = rowsByBureau[bureau];
    if (!row || row.status === "denied") return false;
    const val = approvedCounts[bureau];
    if (val === undefined || val === "") return false;
    return isLargeCountDifference(currentEffectiveValue(row), Number(val));
  });
  const isLargeDiff = largeDiffBureaus.length > 0;

  const handleDenyInModal = async (row) => {
    if (!(await confirm(`Deny the ${row.bureau} count review for ${reviewingClientName}?`))) return;
    const res = await denyRequest(row);
    if (!res.success) {
      addToast({ title: "Failed to Deny", message: res.error || "Unknown error.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    addToast({ title: "Request Denied", message: `${row.bureau} count review for ${reviewingClientName} denied.`, variant: "secondary", icon: "bi-x-circle-fill" });
    setApprovedCounts((prev) => {
      const next = { ...prev };
      delete next[row.bureau];
      return next;
    });
  };

  const handleApprove = async () => {
    const editableBureaus = BUREAUS.filter((bureau) => rowsByBureau[bureau] && rowsByBureau[bureau].status !== "denied");

    if (!initials.trim()) { setModalError("Initials are required."); return; }
    for (const bureau of editableBureaus) {
      const val = approvedCounts[bureau];
      if (val === undefined || val === "" || Number.isNaN(Number(val))) {
        setModalError(`Enter a valid count for ${bureau}.`);
        return;
      }
    }
    if (isLargeDiff && !largeDiffConfirmed) {
      setModalError("Please confirm the large-difference checkbox before approving.");
      return;
    }

    // Only actually submit a bureau if it's still pending (always, since
    // reviewing it is the point) or already approved but the value changed
    // (avoid spamming the append-only approval history with no-op re-saves).
    const bureausToSubmit = editableBureaus.filter((bureau) => {
      const row = rowsByBureau[bureau];
      const newVal = Number(approvedCounts[bureau]);
      if (row.status === "pending") return true;
      return currentEffectiveValue(row) !== newVal;
    });

    if (bureausToSubmit.length === 0) {
      setModalError("No changes to submit.");
      return;
    }

    setSubmitting(true);
    setModalError(null);

    let failureMessage = null;
    let anyPaidInvoice = false;
    for (const bureau of bureausToSubmit) {
      const row = rowsByBureau[bureau];
      const res = await approveRequest(row, Number(approvedCounts[bureau]), initials, largeDiffConfirmed);
      if (!res.success) {
        failureMessage = `Failed on ${bureau}: ${res.error || "Unknown error"}`;
        break;
      }
      if (res.hasPaidInvoice) anyPaidInvoice = true;
    }

    setSubmitting(false);

    if (failureMessage) {
      setModalError(failureMessage);
      addToast({ title: "Approval Failed", message: failureMessage, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    addToast({
      title: "Counts Approved",
      message: `${bureausToSubmit.join(", ")} for ${reviewingClientName} updated.`,
      variant: "success",
      icon: "bi-check-circle-fill",
    });
    if (anyPaidInvoice) {
      setInvoiceNudge({ clientId: reviewingClientId, clientName: reviewingClientName });
    }
    setReviewingClientId(null);
  };

  if (!canApprove) {
    return (
      <Alert variant="warning" className="m-3">
        <i className="bi bi-shield-lock me-2"></i>
        You don't have the "Approve Inquiry Count Reviews" permission needed to view this queue.
      </Alert>
    );
  }

  return (
    <Card className="shadow-sm">
      <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h5 className="mb-0"><i className="bi bi-clipboard-check me-2"></i>Count Review Queue</h5>
        <div className="d-flex gap-2">
          {["pending", "approved", "denied", "all"].map((s) => (
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
        {invoiceNudge && (
          <Alert variant="info" className="m-3 mb-0" dismissible onClose={() => setInvoiceNudge(null)}>
            Approved. <strong>{invoiceNudge.clientName || "This client"}</strong> already has a paid invoice — the
            count change may affect pricing.{" "}
            <Link to={`/clients/${invoiceNudge.clientId}`}>Open their profile</Link> to review and reissue an invoice
            if needed (this is never done automatically).
          </Alert>
        )}

        {error && <Alert variant="danger" className="m-3">{error} — has sql/count_review.sql been run yet?</Alert>}

        {loading ? (
          <div className="text-center py-5"><Spinner animation="border" /></div>
        ) : visibleClientRows.length === 0 ? (
          <div className="text-center text-muted py-5">
            <i className="bi bi-inbox fs-1 d-block mb-2 opacity-50"></i>
            No {statusFilter !== "all" ? statusFilter : ""} count review requests.
          </div>
        ) : (
          <Table responsive hover className="mb-0 align-middle">
            <thead className="text-muted">
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Bureaus</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleClientRows.map((row) => {
                const hasPending = row.requests.some((r) => r.status === "pending");
                return (
                  <tr key={row.clientId}>
                    <td>{new Date(row.mostRecentAt).toLocaleDateString()}</td>
                    <td>
                      <Link to={`/clients/${row.clientId}`} target="_blank" rel="noreferrer">
                        {row.clientName}
                      </Link>
                    </td>
                    <td>
                      <div className="d-flex flex-wrap gap-2">
                        {BUREAUS.map((bureau) => {
                          const r = row.requests.find((x) => x.bureau === bureau);
                          if (!r) return null;
                          const approval = r.count_review_approvals?.[0];
                          return (
                            <div key={bureau} className="small border rounded px-2 py-1">
                              <div className="fw-bold">{bureau}</div>
                              <div className="d-flex align-items-center gap-1">
                                {STATUS_BADGE[r.status] || r.status}
                                <span>
                                  {r.status === "approved" && approval
                                    ? `${approval.approved_count} by ${approval.supervisor_initials}`
                                    : r.ai_count}
                                </span>
                              </div>
                              <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                                {REASON_LABELS[r.reason] || r.reason}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="text-end" style={{ minWidth: 100 }}>
                      <Button size="sm" variant={hasPending ? "success" : "outline-primary"} onClick={() => openReview(row.clientId)}>
                        {hasPending ? "Review" : "Edit"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card.Body>

      <Modal show={!!reviewingClientId} onHide={closeReview} centered>
        <Modal.Header closeButton>
          <Modal.Title>Review Counts — {reviewingClientName}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {BUREAUS.map((bureau) => {
            const row = rowsByBureau[bureau];
            if (!row) return null;
            if (row.status === "denied") {
              return (
                <div key={bureau} className="mb-3 d-flex justify-content-between align-items-center">
                  <span className="fw-bold">{bureau}</span>
                  <Badge bg="secondary">Denied</Badge>
                </div>
              );
            }
            return (
              <Form.Group className="mb-3" key={bureau}>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <Form.Label className="fw-bold mb-0">
                    {bureau} {STATUS_BADGE[row.status]}
                  </Form.Label>
                  {row.status === "pending" && (
                    <Button variant="link" size="sm" className="text-danger p-0" onClick={() => handleDenyInModal(row)}>
                      Deny
                    </Button>
                  )}
                </div>
                <Form.Control
                  type="number"
                  value={approvedCounts[bureau] ?? ""}
                  onChange={(e) => { setApprovedCounts((prev) => ({ ...prev, [bureau]: e.target.value })); setLargeDiffConfirmed(false); }}
                />
                <Form.Text className="text-muted">
                  Reason: {REASON_LABELS[row.reason] || row.reason}
                  {row.reason_detail && ` — ${row.reason_detail}`}
                </Form.Text>
              </Form.Group>
            );
          })}

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Your initials *</Form.Label>
            <Form.Control value={initials} onChange={(e) => setInitials(e.target.value)} placeholder="e.g. JD" />
          </Form.Group>

          {isLargeDiff && (
            <Alert variant="warning" className="small">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              Large change from the reported count for: {largeDiffBureaus.join(", ")}. Please confirm before approving.
              <Form.Check
                className="mt-2"
                type="checkbox"
                id="large-diff-confirm"
                label="I've double-checked these numbers and confirm they're correct."
                checked={largeDiffConfirmed}
                onChange={(e) => setLargeDiffConfirmed(e.target.checked)}
              />
            </Alert>
          )}

          {modalError && <Alert variant="danger" className="small py-2">{modalError}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeReview} disabled={submitting}>Cancel</Button>
          <Button
            variant="success"
            onClick={handleApprove}
            disabled={submitting || (isLargeDiff && !largeDiffConfirmed)}
          >
            {submitting ? "Saving..." : "Approve"}
          </Button>
        </Modal.Footer>
      </Modal>
    </Card>
  );
}
