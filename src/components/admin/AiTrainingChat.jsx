// src/components/admin/AiTrainingChat.jsx
//
// "AI Training Chat" — teach the classify-inquiries Edge Function new
// standing rules in plain English instead of only after-the-fact logging
// (see AITrainingFeedback.jsx / AITestingPlayground.jsx, whose
// ai_training_logs table is write-only and never feeds back into future
// classifications). Rules taught here (sql/add_classification_rules.sql)
// ARE read by classify-inquiries — see that function's buildRulesPromptBlock
// — as strong prompt guidance, same mechanism as the existing lender-alias/
// manual-review/dealership blocks; there's no deterministic force-override
// layer yet, so a rule is only as reliable as the model's compliance with
// it (see that migration's header comment).
//
// Two scopes, picked at the top: "Global" (client_id null, applies to
// every client) or a specific client (applies to that client only, plus
// still sees/benefits from every global rule). Each scope has its own
// conversation thread and rule list.
//
// The chat panel and the sidebar Card both get the same explicit
// calc(100vh - ...) height value directly (see PANEL_HEIGHT below) rather
// than one being stretched to match the other through nested flex
// containers — that stretch-through-nesting approach is what originally
// caused the chat's input row to render off-screen/squeezed away the
// moment a sidebar tab held more content than the chat did. An explicit
// height on each panel independently is more verbose but can't silently
// break that way.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, Spinner } from "react-bootstrap";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../shared/ui/ToastNotifier";
import { fetchAllRows } from "../../utils/fetchAllRows";
import SearchableSelect from "../shared/ui/SearchableSelect";
import TrainingChatThread from "./ai-training/TrainingChatThread";
import {
  fetchChatHistory,
  fetchActiveRules,
  fetchClientCreditData,
  sendChatMessage,
  confirmProposedRule,
  deactivateRule,
} from "../../utils/classificationChat";

const CLASSIFICATION_BADGE = {
  linked: "danger",
  associated: "warning",
  "non-linked": "secondary",
  deleted: "success",
  dnd: "info",
};

const SIDEBAR_PANEL_STYLE = { background: "var(--bg-card, #151E32)", border: "1px solid var(--border-color, #334155)" };
const SIDEBAR_BORDER_COLOR = "var(--border-color, #334155)";

// Explicit height given directly to BOTH the chat panel and the sidebar
// Card — see the comment above the two-panel row below for why this is a
// literal value passed to each, not one panel stretched to match the
// other through nested flex containers. minHeight is a floor so neither
// panel (and critically, the chat's input row) collapses on a short
// screen or in a browser dev-tools split view.
const PANEL_HEIGHT = "calc(100vh - 300px)";
const PANEL_MIN_HEIGHT = 420;

export default function AiTrainingChat() {
  const { userId, adminName, hasPermission } = useAuth();
  const canTrain = hasPermission("train_ai_rules");
  const { addToast } = useToast();

  // Deep-link support — the client profile's "Teach AI" entry points
  // (ClientHeader.jsx's Tools dropdown, InquiriesThread.jsx's per-row
  // action) open this page with ?clientId= (and, from a specific inquiry
  // row, &creditor=&bureau=&date= too) so staff land here already scoped
  // to that client instead of having to search for them again.
  const [searchParams] = useSearchParams();
  const deepLinkClientId = searchParams.get("clientId") || "";
  const deepLinkCreditor = searchParams.get("creditor") || "";
  const deepLinkBureau = searchParams.get("bureau") || "";
  const deepLinkDate = searchParams.get("date") || "";

  const [clientOptions, setClientOptions] = useState([]);
  const [scope, setScope] = useState(deepLinkClientId ? "client" : "global"); // "global" | "client"
  const [selectedClientId, setSelectedClientId] = useState(deepLinkClientId);

  const [draft, setDraft] = useState(
    deepLinkCreditor
      ? `About the ${deepLinkCreditor} inquiry${deepLinkBureau ? ` on ${deepLinkBureau}` : ""}${deepLinkDate ? ` dated ${deepLinkDate}` : ""}: `
      : ""
  );

  const [messages, setMessages] = useState([]);
  const [rules, setRules] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCreditData, setLoadingCreditData] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmingMessageId, setConfirmingMessageId] = useState(null);
  const [dismissedMessageIds, setDismissedMessageIds] = useState(new Set());
  // Right-panel tab — flips to "inquiries" automatically once a client's
  // data loads (below), since that's usually the first thing an admin
  // wants when they came here to teach a rule about a specific client.
  const [sidebarTab, setSidebarTab] = useState("rules");

  const activeClientId = scope === "client" && selectedClientId ? selectedClientId : null;
  const activeClientName = useMemo(
    () => clientOptions.find((o) => o.value === selectedClientId)?.label || null,
    [clientOptions, selectedClientId]
  );

  useEffect(() => {
    (async () => {
      const { data } = await fetchAllRows("clients", { select: "id, full_name", order: "full_name" });
      setClientOptions((data || []).map((c) => ({ value: c.id, label: c.full_name || c.id })));
    })();
  }, []);

  const reload = async () => {
    setLoading(true);
    const [history, activeRules] = await Promise.all([
      fetchChatHistory(activeClientId),
      fetchActiveRules(activeClientId),
    ]);
    setMessages(history);
    setRules(activeRules);
    setDismissedMessageIds(new Set());
    setLoading(false);
  };

  useEffect(() => {
    if (scope === "client" && !selectedClientId) {
      setMessages([]);
      setRules([]);
      setInquiries([]);
      setAccounts([]);
      setLoading(false);
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, selectedClientId]);

  // The selected client's real inquiries AND accounts
  // (utils/classificationChat.js#fetchClientCreditData), so an admin can
  // teach a rule against actual data — a real creditor/bureau/date, or a
  // real account (useful for dealership/captive-finance-company rules,
  // same relationship sql/add_lender_aliases.sql's related_canonical_name
  // already models) — instead of typing one from memory. Global scope has
  // no single client's data to show, so this only runs once a client is
  // picked.
  useEffect(() => {
    if (!activeClientId) {
      setInquiries([]);
      setAccounts([]);
      return;
    }
    let active = true;
    setLoadingCreditData(true);
    setSidebarTab("inquiries");
    fetchClientCreditData(activeClientId).then(({ inquiries: inq, accounts: acc }) => {
      if (active) { setInquiries(inq); setAccounts(acc); setLoadingCreditData(false); }
    });
    return () => { active = false; };
  }, [activeClientId]);

  const handleAskAboutInquiry = (item) => {
    const creditor = item.creditor || item.name || item.account_name || "";
    const date = item.date || item.dateOpened || "";
    setDraft(`About the ${creditor} inquiry${item.bureau ? ` on ${item.bureau}` : ""}${date ? ` dated ${date}` : ""} (currently ${item.classification || "unclassified"}): `);
  };

  const handleAskAboutAccount = (item) => {
    const creditor = item.creditor || item.name || item.account_name || "";
    const date = item.date || item.dateOpened || "";
    setDraft(`About the ${creditor} account${item.type ? ` (${item.type})` : ""}${date ? `, opened ${date}` : ""}${item.openClosed ? `, ${item.openClosed}` : ""}: `);
  };

  const handleSend = async (text) => {
    setSending(true);
    try {
      const assistantRow = await sendChatMessage({
        clientId: activeClientId,
        clientName: activeClientName,
        history: messages,
        message: text,
        adminId: userId,
        adminName,
      });
      setMessages((prev) => [
        ...prev,
        { id: `local-user-${Date.now()}`, role: "user", content: text, created_by_name: adminName, created_at: new Date().toISOString() },
        assistantRow,
      ]);
    } catch (err) {
      addToast({ title: "Training Chat Error", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSending(false);
    }
  };

  const handleConfirmRule = async (message) => {
    setConfirmingMessageId(message.id);
    try {
      // The admin's own message right before this one is the most useful
      // "why this rule exists" audit trail — cheap to find since messages
      // are already in chronological order.
      const idx = messages.findIndex((m) => m.id === message.id);
      const sourceMessage = [...messages].slice(0, idx).reverse().find((m) => m.role === "user")?.content || null;

      const rule = await confirmProposedRule({
        messageId: message.id,
        proposedRule: message.proposed_rule,
        clientId: activeClientId,
        adminId: userId,
        adminName,
        sourceMessage,
      });
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, rule_id: rule.id } : m)));
      setRules((prev) => [rule, ...prev]);
      addToast({ title: "Rule Saved", message: rule.rule_text, variant: "success", icon: "bi-check-circle-fill" });
    } catch (err) {
      addToast({ title: "Failed to Save Rule", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setConfirmingMessageId(null);
    }
  };

  const handleDismissRule = (message) => {
    setDismissedMessageIds((prev) => new Set(prev).add(message.id));
  };

  const handleDeactivateRule = async (rule) => {
    try {
      await deactivateRule(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      addToast({ title: "Rule Removed", message: rule.rule_text, variant: "secondary", icon: "bi-x-circle-fill" });
    } catch (err) {
      addToast({ title: "Failed to Remove Rule", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  };

  if (!canTrain) {
    return (
      <Alert variant="warning" className="m-3">
        <i className="bi bi-shield-lock me-2"></i>
        You don't have the "Train AI Classifier" permission needed to view this page.
      </Alert>
    );
  }

  return (
    <div className="p-3">
      <h5 className="mb-3"><i className="bi bi-robot me-2"></i>AI Training Chat</h5>

      {/* Who you're training — big and unmissable, since this decides
          everything below it (which conversation thread, which rules
          apply, whose data shows up on the right). */}
      <div
        className="d-flex flex-wrap align-items-center gap-3 p-3 mb-3 rounded-3"
        style={{ background: "rgba(14, 165, 233, 0.08)", border: "1px solid rgba(14, 165, 233, 0.3)" }}
      >
        <span className="fw-bold text-uppercase small" style={{ letterSpacing: "0.03em" }}>Who are you training?</span>
        <div className="btn-group">
          <Button variant={scope === "global" ? "primary" : "outline-secondary"} onClick={() => setScope("global")}>
            <i className="bi bi-globe me-2" />Every Client (Global)
          </Button>
          <Button variant={scope === "client" ? "primary" : "outline-secondary"} onClick={() => setScope("client")}>
            <i className="bi bi-person me-2" />One Specific Client
          </Button>
        </div>
        {scope === "client" && (
          <div style={{ minWidth: 280, flex: "1 1 280px" }}>
            <SearchableSelect
              name="training_chat_client"
              options={clientOptions}
              placeholder={clientOptions.length ? "Search clients by name…" : "Loading clients…"}
              defaultValue={selectedClientId}
              onChange={setSelectedClientId}
            />
          </div>
        )}
        {activeClientName && (
          <Badge bg="info" text="dark" className="fs-6 px-3 py-2">
            <i className="bi bi-check-circle-fill me-1" />Training on {activeClientName}
          </Badge>
        )}
      </div>

      {/* Both panels below get the SAME explicit height value directly,
          rather than one being stretched to match the other through
          several layers of nested flex containers (Card > Card.Body > row
          > col) — that chain is exactly what silently squeezed the chat's
          input row down to nothing before. minHeight is a floor for short
          screens; the number subtracted accounts for AdminLayout's navbar/
          footer plus everything above this row on the page (title, the
          "who are you training" bar, and this element's own margins). */}
      <div className="row g-3">
        <div className="col-lg-8">
          {scope === "client" && !selectedClientId ? (
            <Alert variant="info" className="mb-0">Pick a client above to see or teach rules scoped to them.</Alert>
          ) : (
            <TrainingChatThread
              messages={messages}
              loading={loading}
              sending={sending}
              onSend={handleSend}
              onConfirmRule={handleConfirmRule}
              onDismissRule={handleDismissRule}
              confirmingMessageId={confirmingMessageId}
              dismissedMessageIds={dismissedMessageIds}
              draft={draft}
              onDraftChange={setDraft}
              height={PANEL_HEIGHT}
              minHeight={PANEL_MIN_HEIGHT}
            />
          )}
        </div>
        <div className="col-lg-4">
          <Card className="d-flex flex-column" style={{ ...SIDEBAR_PANEL_STYLE, height: PANEL_HEIGHT, minHeight: PANEL_MIN_HEIGHT }}>
            <Card.Header className="d-flex align-items-center gap-2 flex-shrink-0">
              <div className="btn-group btn-group-sm flex-wrap">
                <Button variant={sidebarTab === "rules" ? "primary" : "outline-secondary"} onClick={() => setSidebarTab("rules")}>
                  Rules
                </Button>
                {activeClientId && (
                  <>
                    <Button variant={sidebarTab === "inquiries" ? "primary" : "outline-secondary"} onClick={() => setSidebarTab("inquiries")}>
                      Inquiries {inquiries.length > 0 && <Badge bg="light" text="dark" className="ms-1">{inquiries.length}</Badge>}
                    </Button>
                    <Button variant={sidebarTab === "accounts" ? "primary" : "outline-secondary"} onClick={() => setSidebarTab("accounts")}>
                      Accounts {accounts.length > 0 && <Badge bg="light" text="dark" className="ms-1">{accounts.length}</Badge>}
                    </Button>
                  </>
                )}
              </div>
            </Card.Header>
            <Card.Body className="flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
              {sidebarTab === "rules" && (
                    loading ? (
                      <div className="text-center text-muted py-4"><Spinner size="sm" animation="border" /></div>
                    ) : rules.length === 0 ? (
                      <div className="text-muted small">No rules taught yet.</div>
                    ) : (
                      rules.map((r) => (
                        <div key={r.id} className="mb-3 pb-3 border-bottom" style={{ borderColor: SIDEBAR_BORDER_COLOR }}>
                          <div className="d-flex justify-content-between align-items-start gap-2">
                            <Badge bg={r.client_id ? "info" : "warning"} text="dark">{r.client_id ? "Client" : "Global"}</Badge>
                            <Button size="sm" variant="link" className="text-danger p-0" onClick={() => handleDeactivateRule(r)} title="Remove rule">
                              <i className="bi bi-trash" />
                            </Button>
                          </div>
                          <div className="small mt-1">{r.rule_text}</div>
                          {r.action && <div className="text-muted" style={{ fontSize: "0.75rem" }}>Action: {r.action}</div>}
                        </div>
                      ))
                    )
                  )}

                  {sidebarTab === "inquiries" && (
                    loadingCreditData ? (
                      <div className="text-center text-muted py-4"><Spinner size="sm" animation="border" /></div>
                    ) : inquiries.length === 0 ? (
                      <div className="text-muted small">No inquiries on file for this client yet.</div>
                    ) : (
                      inquiries.map((item, i) => (
                        <div key={i} className="mb-2 pb-2 border-bottom d-flex justify-content-between align-items-center gap-2" style={{ borderColor: SIDEBAR_BORDER_COLOR }}>
                          <div className="small">
                            <div className="fw-semibold">{item.creditor || item.name || "—"}</div>
                            <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                              {item.bureau} · {item.date || item.dateOpened || "—"}{" "}
                              <Badge bg={CLASSIFICATION_BADGE[item.classification] || "secondary"} className="ms-1">
                                {item.classification || "unclassified"}
                              </Badge>
                            </div>
                          </div>
                          <Button size="sm" variant="outline-info" title="Ask the AI about this inquiry" onClick={() => handleAskAboutInquiry(item)}>
                            <i className="bi bi-chat-left-dots" />
                          </Button>
                        </div>
                      ))
                    )
                  )}

                  {sidebarTab === "accounts" && (
                    loadingCreditData ? (
                      <div className="text-center text-muted py-4"><Spinner size="sm" animation="border" /></div>
                    ) : accounts.length === 0 ? (
                      <div className="text-muted small">No accounts on file for this client yet.</div>
                    ) : (
                      accounts.map((item, i) => (
                        <div key={i} className="mb-2 pb-2 border-bottom d-flex justify-content-between align-items-center gap-2" style={{ borderColor: SIDEBAR_BORDER_COLOR }}>
                          <div className="small">
                            <div className="fw-semibold">{item.creditor || item.name || "—"}</div>
                            <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                              {item.type || "—"} · Opened {item.date || item.dateOpened || "—"}{" "}
                              <Badge bg={item.openClosed === "Closed" ? "secondary" : "success"} className="ms-1">
                                {item.openClosed || "Open"}
                              </Badge>
                            </div>
                          </div>
                          <Button size="sm" variant="outline-info" title="Ask the AI about this account" onClick={() => handleAskAboutAccount(item)}>
                            <i className="bi bi-chat-left-dots" />
                          </Button>
                        </div>
                      ))
                    )
                  )}
                </Card.Body>
              </Card>
            </div>
          </div>
        </div>
  );
}
