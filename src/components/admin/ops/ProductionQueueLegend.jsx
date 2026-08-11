import { useState } from "react";
import { Badge, Button, Modal } from "react-bootstrap";
import { AGING_BUCKETS } from "../../../utils/aging";
import { STAGE_BADGE_STYLE } from "../../../utils/workflowStage";

function LegendRow({ children, badge }) {
  return (
    <div className="d-flex align-items-start gap-2 mb-2">
      <div style={{ minWidth: 110, flexShrink: 0 }}>{badge}</div>
      <div className="small text-muted">{children}</div>
    </div>
  );
}

/**
 * Help icon + Modal explaining every tag/badge shown on a client card, plus
 * the Docs → Calls → Completed workflow stage cycle those tags are drawn
 * from (see utils/workflowStage.js and Workflow-Engine-Proposal-Review.md
 * for the underlying pipelines). Kept as its own component (rather than
 * inline in ProductionQueue.jsx) since it's pure explanatory content with
 * its own show/hide state — and shared as-is by WorkflowPipeline.jsx's
 * drill-down (it renders the exact same ClientCardGrid cards), just with a
 * different `title` so it doesn't say "Production Queue" when opened from
 * the Pipeline tab.
 */
export default function ProductionQueueLegend({ title = "Production Queue Tag Guide" }) {
  const [show, setShow] = useState(false);

  return (
    <>
      <Button
        variant="outline-secondary"
        size="sm"
        className="d-flex align-items-center gap-1"
        onClick={() => setShow(true)}
        title="What do these tags mean?"
      >
        <i className="bi bi-question-circle"></i> Tag Guide
      </Button>

      <Modal show={show} onHide={() => setShow(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold">
            <i className="bi bi-tags-fill me-2"></i>{title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <h6 className="fw-bold text-uppercase text-muted small">Workflow Stage</h6>
          <p className="small text-muted mb-2">
            Experian and TU/EQ both run on the same docs-round + 7-day-wait cycle, gated on their own
            bureau checkbox — but they're still shown as two separate badges since a client can be at a
            different point in that cycle for EXP than for TU/EQ:
          </p>
          <ul className="small text-muted mb-2">
            <li><strong>Experian</strong> becomes callable 7 days after the docs round was created, once FTC, CFPB, and the EXP checkbox are submitted.</li>
            <li><strong>TransUnion/Equifax</strong> stay on the same docs-round cycle and become callable 7 days after that round's Document Routing task was created, once FTC, CFPB, and both bureau checkboxes are submitted.</li>
          </ul>
          <p className="small text-muted mb-2">
            Both are <strong>self-healing</strong>: the moment either becomes eligible, it auto-queues into
            Call Routing on its own — no one has to remember to click anything. This reads directly from
            the Document Routing / Call Routing queues, so it always matches what's actually queued there.
          </p>
          <LegendRow badge={<Badge bg={STAGE_BADGE_STYLE.docs.bg}><i className={`bi ${STAGE_BADGE_STYLE.docs.icon} me-1`}></i>EXP/TU/EQ — Docs R#</Badge>}>
            In the <strong>Document Routing</strong> queue for this round, or not yet 7 days old. If nothing
            is queued yet, this shows the round it will auto-queue into next.
          </LegendRow>
          <LegendRow badge={<Badge bg={STAGE_BADGE_STYLE.waiting.bg}><i className={`bi ${STAGE_BADGE_STYLE.waiting.icon} me-1`}></i>EXP/TU/EQ — R# (3d to call)</Badge>}>
            Docs for this round exist but haven't hit the 7-day mark yet — shows how many days remain
            before this bureau becomes callable.
          </LegendRow>
          <LegendRow badge={<Badge bg={STAGE_BADGE_STYLE.ready.bg}><i className={`bi ${STAGE_BADGE_STYLE.ready.icon} me-1`}></i>Ready to Call</Badge>}>
            The 7-day wait is over and FTC/CFPB/this bureau's checkbox are all submitted, but it hasn't
            been auto-queued into Call Routing yet — will be on the next sync (every time an ops screen loads).
          </LegendRow>
          <LegendRow badge={<Badge bg={STAGE_BADGE_STYLE.calls.bg}><i className={`bi ${STAGE_BADGE_STYLE.calls.icon} me-1`}></i>EXP/TU/EQ — Call R#</Badge>}>
            Actually sitting in the <strong>Call Routing</strong> queue right now, waiting on that call to happen.
          </LegendRow>
          <LegendRow badge={<Badge bg={STAGE_BADGE_STYLE.completed.bg}><i className={`bi ${STAGE_BADGE_STYLE.completed.icon} me-1`}></i>Completed</Badge>}>
            All three bureaus (EXP/TU/EQ) are completed or marked N/A. Nothing left queued.
          </LegendRow>

          <hr />

          <h6 className="fw-bold text-uppercase text-muted small">What To Do Next</h6>
          <p className="small text-muted mb-2">
            Underneath the stage badge, each card/row also shows a plain-English "next action" line —
            this is what actually needs to happen for that bureau right now. "Unassigned" just means no
            admin/employee has been assigned to this client yet.
          </p>
          <LegendRow badge={<code className="small">Need docs for TU/EQ R1 — unassigned</code>}>
            Still needs FTC, CFPB, and this bureau's checkbox submitted for this round (Document Routing),
            and there isn't yet an assigned admin. Not overdue yet.
          </LegendRow>
          <LegendRow badge={<code className="small">Docs overdue for TU/EQ R1 — finish FTC/CFPB/bureau checkboxes</code>}>
            Same as above, but the round has been open 7+ days with checkboxes still missing — needs attention.
          </LegendRow>
          <LegendRow badge={<code className="small">Docs submitted — TU/EQ call in 3d</code>}>
            FTC/CFPB/bureau checkboxes are all done; just waiting out the rest of the mandatory 7-day window
            before this bureau can be called.
          </LegendRow>
          <LegendRow badge={<code className="small">TU/EQ ready to call — queuing automatically</code>}>
            The 7-day wait is over — this will auto-queue into Call Routing on the next sync, no action needed.
          </LegendRow>
          <LegendRow badge={<code className="small">Call TU/EQ now — Jane, due Aug 4</code>}>
            Sitting in Call Routing right now. Shows who it's assigned to and the due date, if set — or
            <code className="small ms-1">— unassigned</code> if no one's been assigned to make the call yet.
          </LegendRow>
          <LegendRow badge={<code className="small">Need docs round created for TU/EQ</code>}>
            No docs round exists yet for this bureau — one needs to be created in Document Routing before
            anything else can move.
          </LegendRow>

          <hr />

          <h6 className="fw-bold text-uppercase text-muted small">Payment</h6>
          <LegendRow badge={<Badge bg="success">PAID</Badge>}>Payment has been received.</LegendRow>
          <LegendRow badge={<Badge bg="warning" text="dark">UNPAID</Badge>}>Payment has not been received yet.</LegendRow>

          <hr />

          <h6 className="fw-bold text-uppercase text-muted small">Attention Flags</h6>
          <LegendRow badge={<Badge bg="secondary">DOCS</Badge>}>
            Missing a required client document (license, SSN, or POA) needed before cover letters/disputes
            can go out.
          </LegendRow>
          <LegendRow badge={<Badge bg="danger">ISSUE</Badge>}>Flagged with an internal issue that needs attention.</LegendRow>
          <LegendRow badge={<Badge bg="danger"><i className="bi bi-shield-lock-fill me-1"></i>HOLD</Badge>}>
            <strong>Authorization Hold</strong> — a bureau's disputable count grew past what Count Review
            already approved. Blocked from being marked complete again until a supervisor reviews the new
            count or a manager overrides it.
          </LegendRow>
          <LegendRow badge={<Badge bg="info">READY</Badge>}>Ready to be marked complete.</LegendRow>
          <LegendRow badge={<Badge bg="warning" text="dark">COUNT REVIEW</Badge>}>
            Has a pending Count Review request awaiting supervisor approval.
          </LegendRow>
          <LegendRow badge={<Badge bg="dark">UNASSIGNED</Badge>}>No admin/employee is assigned to this client yet.</LegendRow>

          <hr />

          <h6 className="fw-bold text-uppercase text-muted small">Case Management Countdown</h6>
          <LegendRow badge={<Badge bg="info">3d LEFT</Badge>}>
            Days remaining until the next SmartCredit/IDIQ report check-in is due (30 days from the last
            report update, or from the paid date if never updated).
          </LegendRow>
          <LegendRow badge={<Badge bg="danger">OVERDUE 4d</Badge>}>
            The 30-day check-in window has passed — the report needs to be pulled/updated.
          </LegendRow>

          <hr />

          <h6 className="fw-bold text-uppercase text-muted small">Aging</h6>
          {AGING_BUCKETS.map((b) => (
            <LegendRow
              key={b.key}
              badge={
                <span className="d-flex align-items-center gap-2">
                  <span className="rounded-circle d-inline-block" style={{ width: 12, height: 12, backgroundColor: b.color }} />
                  <span className="fw-bold" style={{ color: b.color }}>{b.label}</span>
                </span>
              }
            >
              Business days the file has been processing (since paid), or waiting on payment if unpaid.
            </LegendRow>
          ))}

          <hr />

          <h6 className="fw-bold text-uppercase text-muted small">Other</h6>
          <LegendRow
            badge={
              <span className="bg-danger text-white px-2 py-1 small fw-bold" style={{ borderRadius: 4 }}>
                <i className="bi bi-pin-angle-fill"></i> URGENT
              </span>
            }
          >
            Ribbon shown when this client has a pinned Manager Note.
          </LegendRow>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShow(false)}>Close</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
