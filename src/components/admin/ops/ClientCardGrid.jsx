import { Badge, Card, Col, Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import { getAgingBucket, getCaseManagementCountdown } from "../../../utils/aging";
import { resolveServiceId } from "../../../utils/services";
import { STAGE_BADGE_STYLE, OVERDUE_DARK_HEX } from "../../../utils/workflowStage";

// Card-per-client grid — extracted out of ProductionQueue.jsx so
// WorkflowPipeline.jsx's stage drill-down list can render the exact same
// card (aging dot, PAID/UNPAID, workflow-stage badges, DOCS/ISSUE/HOLD
// flags, latest comment/note) instead of a second, drifting copy.
// ProductionQueue.jsx now just does its own filtering/chips and hands the
// final list to this component.

// Compact "Jul 18, 2:30 PM" formatting for the latest-comment/latest-note
// timestamps on each card — matches the level of detail CommentsSection.jsx
// shows, just shorter to fit a card.
function formatShortDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StageBadge({ stage }) {
  if (!stage) return null;
  const style = STAGE_BADGE_STYLE[stage.type] || {};
  return (
    <>
      <Badge bg={style.bg || "secondary"} style={{ fontSize: "0.65rem" }} title={stage.tooltip}>
        <i className={`bi ${style.icon || "bi-signpost-2-fill"} me-1`}></i>
        {stage.label}
      </Badge>
      {/* Past 7 days with FTC/CFPB/bureau checkboxes still not all
          checked (see workflowStage.js's computeTuEqStage) — the call
          won't auto-queue on its own until this round is actually
          complete, so this round needs a person to go finish it rather
          than just waiting it out. */}
      {stage.overdue && (
        <Badge bg="danger" style={{ fontSize: "0.65rem" }} title={stage.tooltip}>
          <i className="bi bi-exclamation-triangle-fill me-1"></i>
          OVERDUE
        </Badge>
      )}
    </>
  );
}

// Renders workflowStage.js's `nextAction` — a plain-English, no-guessing
// sentence ("Need docs for TU/EQ R2 — unassigned", "Call EXP now — Roselle,
// due Aug 4", "Docs submitted — TU/EQ call in 5d") instead of a status
// readout an admin has to interpret. This is the answer to "what do I
// actually do for this client," which is the whole reason this card grid
// exists — so nobody has to open Document Routing or Call Routing, or ask
// someone, just to find out. workflowStage.js owns the wording entirely;
// this just prints whatever it decided, plus a red treatment for overdue
// docs so that one still stands out from a normal instruction.
function StageAssigneeLine({ stage }) {
  if (!stage || !stage.nextAction) return null;
  const icon = stage.type === "calls" ? "bi-telephone-fill" : "bi-file-earmark-text-fill";
  // Fixed colors, not `text-muted`/`text-danger` — same reason the Pipeline
  // tiles moved off Bootstrap's theme-reactive classes: dark mode remaps
  // those to tones meant for a specific background, and this line needs to
  // read clearly regardless. `darkHex`/`OVERDUE_DARK_HEX` are tuned for
  // this card's dark background specifically (see workflowStage.js).
  const color = stage.overdue ? OVERDUE_DARK_HEX : STAGE_BADGE_STYLE[stage.type]?.darkHex || "#e9ecef";
  return (
    <div className="small d-flex align-items-center gap-1 fw-semibold" style={{ color }} title={stage.tooltip}>
      <i className={`bi ${stage.overdue ? "bi-exclamation-triangle-fill" : icon}`}></i>
      <span>{stage.nextAction}</span>
    </div>
  );
}

// Same check CommentsSection.jsx uses to decide whether a comment's text is
// actually a pasted-screenshot URL (handlePaste there stores the uploaded
// image's URL as the comment body) rather than written text.
const isImageUrl = (text) =>
  typeof text === "string" && text.startsWith("http") && /\.(jpeg|jpg|gif|png|webp)$/i.test(text.trim());

/** Renders a card's latest-comment/latest-note line: a small thumbnail
 * preview if the text is an image link (matches the Activity Thread's own
 * behavior), otherwise the truncated text. */
function ActivityLine({ icon, entry }) {
  if (!entry) return null;
  const isImage = isImageUrl(entry.text);
  return (
    <div className="small mb-1">
      <div className="d-flex align-items-center gap-1">
        <i className={`bi ${icon} text-muted`}></i>
        {isImage ? (
          <a href={entry.text.trim()} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <img
              src={entry.text.trim()}
              alt="attachment preview"
              style={{ maxHeight: 40, maxWidth: 60, borderRadius: 4, objectFit: "cover" }}
              onError={(e) => (e.target.style.display = "none")}
            />
          </a>
        ) : (
          <span className="text-truncate" title={entry.text}>{entry.text}</span>
        )}
      </div>
      <div className="text-muted" style={{ fontSize: "0.7rem" }}>
        {entry.author || "—"}, {formatShortDateTime(entry.at)}
      </div>
    </div>
  );
}

export default function ClientCardGrid({ clients, loading, emptyMessage = "No clients match this filter." }) {
  if (loading) {
    return <div className="text-muted small">Loading…</div>;
  }
  if (!clients || clients.length === 0) {
    return (
      <div className="text-center text-muted py-5">
        <i className="bi bi-inbox fs-1 d-block mb-2 opacity-50"></i>
        {emptyMessage}
      </div>
    );
  }

  return (
    <Row className="g-3">
      {clients.map((c) => {
        const bucket = getAgingBucket(c.agingDaysCurrent);
        const isCaseManagement = resolveServiceId(c) === "credit_repair";
        const countdown = isCaseManagement && c.is_paid ? getCaseManagementCountdown(c) : null;
        return (
          <Col key={c.id} xs={12} sm={6} lg={4} xl={3}>
            <Card
              as={Link}
              to={`/clients/${c.id}`}
              className={`shadow-sm h-100 text-decoration-none text-dark position-relative ${c.hasPinnedNote ? "border-danger" : "border-0"}`}
              style={c.hasPinnedNote ? { borderWidth: 2, boxShadow: "0 0 0 1px rgba(220,53,69,0.35)" } : undefined}
            >
              {c.hasPinnedNote && (
                <div
                  className="position-absolute top-0 end-0 bg-danger text-white d-flex align-items-center gap-1 px-2 py-1"
                  style={{ fontSize: "0.65rem", fontWeight: 700, borderBottomLeftRadius: 6, zIndex: 1 }}
                  title="This client has a pinned Manager Note"
                >
                  <i className="bi bi-pin-angle-fill"></i> URGENT
                </div>
              )}
              <Card.Body>
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div className="fw-bold">{c.full_name || "Unnamed Client"}</div>
                  <div className="d-flex align-items-center gap-1 flex-shrink-0">
                    <span
                      className="small fw-bold"
                      style={{ color: bucket.color }}
                      title={`${c.agingDaysCurrent ?? 0} business days — ${bucket.label}`}
                    >
                      {c.agingDaysCurrent ?? 0}d
                    </span>
                    <span
                      className="rounded-circle d-inline-block flex-shrink-0"
                      style={{ width: 12, height: 12, backgroundColor: bucket.color }}
                      title={`${c.agingDaysCurrent ?? 0} business days — ${bucket.label}`}
                    />
                  </div>
                </div>
                <div className="small text-muted mb-2">
                  {c.companies?.company_name || "No Partner"}
                  {c.profiles?.full_name && <> · {c.profiles.full_name}</>}
                </div>
                <div className="small mb-2">{c.start_inquiries || "—"}</div>
                <div className="d-flex flex-wrap gap-1">
                  {c.is_paid ? (
                    <Badge bg="success" style={{ fontSize: "0.65rem" }}>PAID</Badge>
                  ) : (
                    <Badge bg="warning" text="dark" style={{ fontSize: "0.65rem" }}>UNPAID</Badge>
                  )}
                  {/* Experian and TU/EQ share the same docs-round +
                      7-day-wait track now (see workflowStage.js's
                      computeDocsGatedStage), but are still gated on
                      different bureau "submitted" checkboxes and can sit
                      at different stages at the same time — so up to two
                      badges show side by side instead of one combined
                      one. `completed` replaces both once every bureau
                      is done/N-A. */}
                  <StageBadge stage={c.workflowStage?.completed} />
                  <StageBadge stage={c.workflowStage?.exp} />
                  <StageBadge stage={c.workflowStage?.tuEq} />
                  {c.flags?.missingDocuments && <Badge bg="secondary" style={{ fontSize: "0.65rem" }}>DOCS</Badge>}
                  {c.flags?.docIssue && (
                    <Badge bg="warning" text="dark" style={{ fontSize: "0.65rem" }} title="AI check flagged a document (license, SSN card, or POA) as expired, invalid, or needing review — see Cover Letter Assets on the client's profile">
                      <i className="bi bi-file-earmark-excel-fill me-1"></i>DOC ISSUE
                    </Badge>
                  )}
                  {c.flags?.internalIssue && <Badge bg="danger" style={{ fontSize: "0.65rem" }}>ISSUE</Badge>}
                  {c.flags?.authorizationHold && (
                    <Badge bg="danger" style={{ fontSize: "0.65rem" }} title="A bureau's disputable count has grown past what's already approved — needs Count Review or a manager override before it can be marked complete again">
                      <i className="bi bi-shield-lock-fill me-1"></i>HOLD
                    </Badge>
                  )}
                  {c.flags?.readyToComplete && <Badge bg="info" style={{ fontSize: "0.65rem" }}>READY</Badge>}
                  {c.flags?.countReviewPending && <Badge bg="warning" text="dark" style={{ fontSize: "0.65rem" }}>COUNT REVIEW</Badge>}
                  {!c.admin_id && <Badge bg="dark" style={{ fontSize: "0.65rem" }}>UNASSIGNED</Badge>}
                  {countdown && (
                    <Badge
                      bg={countdown.isOverdue ? "danger" : "info"}
                      style={{ fontSize: "0.65rem" }}
                      title={c.last_report_update_at ? "Case Management check-in countdown, from last report update" : "Case Management check-in countdown, from paid date (no report update yet)"}
                    >
                      {countdown.isOverdue ? `OVERDUE ${Math.abs(countdown.daysLeft)}d` : `${countdown.daysLeft}d LEFT`}
                    </Badge>
                  )}
                </div>
                {(c.workflowStage?.exp?.nextAction || c.workflowStage?.tuEq?.nextAction) && (
                  <div className="mt-1">
                    <StageAssigneeLine stage={c.workflowStage?.exp} />
                    <StageAssigneeLine stage={c.workflowStage?.tuEq} />
                  </div>
                )}
                {(c.approved_exp_count != null || c.approved_tu_count != null || c.approved_eq_count != null) && (
                  <div className="small text-muted mt-1">
                    Approved to dispute — EXP {c.approved_exp_count ?? "Pending"} · TU {c.approved_tu_count ?? "Pending"} · EQ {c.approved_eq_count ?? "Pending"}
                  </div>
                )}
                {(c.latestComment || c.latestNote) && (
                  <div className="mt-2 pt-2 border-top">
                    <ActivityLine icon="bi-chat-left-text" entry={c.latestComment} />
                    <ActivityLine icon="bi-sticky" entry={c.latestNote} />
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        );
      })}
    </Row>
  );
}
