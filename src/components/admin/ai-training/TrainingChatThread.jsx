// src/components/admin/ai-training/TrainingChatThread.jsx
//
// Message-list UI for the AI Training Chat page (../AiTrainingChat.jsx).
// Visual bubble styling borrows from src/components/shared/support/SupportChatThread.jsx
// (same dark-panel container, bubble colors, auto-scroll-to-bottom pattern)
// but is a new, lighter component rather than reusing that one directly —
// SupportChatThread owns its own Supabase realtime subscription hard-wired
// to the support_messages table (two-party human chat), whereas this is a
// single admin talking to one AI with no realtime multi-party requirement,
// so it just takes `messages` + callbacks as props and lets the parent
// page own the data layer (AiTrainingChat.jsx).
//
// Adds one bubble type SupportChatThread doesn't have: a proposed-rule
// confirmation card, shown under an assistant message that included one,
// with Save/Dismiss actions.
import { useEffect, useRef } from "react";
import { Badge, Button, Form, Spinner } from "react-bootstrap";

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function ProposedRuleCard({ rule, onConfirm, onDismiss, confirming, resolved }) {
  if (!rule) return null;
  return (
    <div
      className="mt-2 p-3 rounded-3 shadow-sm"
      style={{ background: "rgba(14, 165, 233, 0.08)", border: "1px solid rgba(14, 165, 233, 0.35)", maxWidth: "85%" }}
    >
      <div className="d-flex align-items-center gap-2 mb-2">
        <i className="bi bi-magic text-info" />
        <strong className="small text-uppercase" style={{ letterSpacing: "0.03em" }}>Proposed Rule</strong>
        <Badge bg={rule.scope === "global" ? "warning" : "info"} text="dark">
          {rule.scope === "global" ? "All Clients" : "This Client"}
        </Badge>
      </div>
      <div className="mb-2">{rule.ruleText}</div>
      {rule.creditorPattern && (
        <div className="small text-muted mb-1">Creditor: <span className="fw-semibold">{rule.creditorPattern}</span></div>
      )}
      {rule.action && (
        <div className="small text-muted mb-2">Action: <span className="fw-semibold">{rule.action}</span></div>
      )}
      {resolved ? (
        <div className="small text-success fw-semibold"><i className="bi bi-check-circle-fill me-1" />Saved</div>
      ) : (
        <div className="d-flex gap-2 mt-2">
          <Button size="sm" variant="info" className="fw-bold" onClick={onConfirm} disabled={confirming}>
            {confirming ? <Spinner size="sm" /> : <><i className="bi bi-check-lg me-1" />Save Rule</>}
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={onDismiss} disabled={confirming}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

export default function TrainingChatThread({
  messages,
  loading,
  sending,
  onSend,
  onConfirmRule,
  onDismissRule,
  confirmingMessageId,
  dismissedMessageIds,
  emptyText = "Teach the classifier a rule — e.g. \"Capital One dealership inquiries should always be Do Not Dispute.\"",
  height = 520,
  minHeight,
  // Controlled, not local state — the parent page needs to be able to drop
  // text into the input from outside a keystroke (a sampled inquiry row's
  // "Ask about this" button, or a deep-link query param), including after
  // this component is already mounted, which an initial-value-only prop
  // can't do.
  draft,
  onDraftChange,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    onDraftChange("");
    onSend(text);
  };

  return (
    <div
      className="d-flex flex-column rounded-3 shadow-sm"
      style={{ background: "var(--bg-card, #151E32)", border: "1px solid var(--border-color, #334155)", height, minHeight }}
    >
      {/* min-height: 0 overrides flexbox's default min-height: auto on a
          flex-grow item — without it, this div refuses to shrink below its
          own content's natural height (a classic flexbox trap), which lets
          long conversations silently push the input row (below) out past
          the bottom of this component's fixed-height container instead of
          scrolling internally. */}
      <div className="flex-grow-1 overflow-auto p-3" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="text-center text-muted py-5"><Spinner animation="border" size="sm" className="me-2" />Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted py-5 small px-4">{emptyText}</div>
        ) : (
          messages.map((m) => {
            const mine = m.role === "user";
            return (
              <div key={m.id} className={`d-flex flex-column mb-3 ${mine ? "align-items-end" : "align-items-start"}`}>
                <div
                  className="px-3 py-2 rounded-3"
                  style={{
                    maxWidth: "75%",
                    background: mine ? "var(--primary-blue, #0EA5E9)" : "rgba(148, 163, 184, 0.12)",
                    color: mine ? "#fff" : "var(--text-primary, #F8FAFC)",
                  }}
                >
                  {m.content}
                </div>
                <span className="text-muted mt-1" style={{ fontSize: "0.7rem" }}>
                  {mine ? (m.created_by_name || "You") : "AI Classifier"} · {formatTime(m.created_at)}
                </span>
                {!mine && m.proposed_rule && (
                  <ProposedRuleCard
                    rule={m.proposed_rule}
                    onConfirm={() => onConfirmRule(m)}
                    onDismiss={() => onDismissRule(m)}
                    confirming={confirmingMessageId === m.id}
                    resolved={!!m.rule_id || dismissedMessageIds?.has(m.id)}
                  />
                )}
              </div>
            );
          })
        )}
        {sending && (
          <div className="d-flex align-items-center gap-2 text-muted small">
            <Spinner animation="border" size="sm" />Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {/* flex-shrink-0 is load-bearing — without it, this row can get
          squeezed to nothing if the panel above ever ends up shorter than
          its content wants (exactly what happened when this panel's height
          was driven by stretching through several nested flex containers
          instead of an explicit value — see AiTrainingChat.jsx's own
          comment on how it now computes height directly). The message list
          right above is the only part of this component allowed to
          shrink/scroll; the input stays pinned no matter what. */}
      <Form onSubmit={handleSubmit} className="d-flex gap-2 p-2 border-top flex-shrink-0" style={{ borderColor: "var(--border-color, #334155)" }}>
        <Form.Control
          type="text"
          placeholder="Describe a classification rule…"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          disabled={sending}
          autoComplete="off"
        />
        <Button type="submit" variant="primary" disabled={sending || !draft.trim()}>
          <i className="bi bi-send-fill" />
        </Button>
      </Form>
    </div>
  );
}
