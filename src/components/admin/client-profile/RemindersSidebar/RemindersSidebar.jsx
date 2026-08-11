import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Form, ListGroup,Alert } from "react-bootstrap";
import { usePrompt } from "../../../../utils/usePrompt";
import Fetch3BModal from "../modals/Fetch3bModal";
import LogCallModal from "../modals/LogCallModal";
import LogDocumentModal from "../modals/LogDocumentModal";
import ParseReportModal from "../modals/ParseRreportModal";
import CommentsSection from "../CommentsSection";
import { supabase } from "../../../../supabaseClient";
import { useAuth } from "../../../../context/AuthContext";
import { useToast } from "../../../shared/ui/ToastNotifier";
import { ASSET_KEYS } from "../../../../utils/documentAssetLabels";

// Maps a checklist reminder's exact text to a function reading the real
// `signals` this sidebar loads below — a client actually did the thing, so
// the checkbox reflects reality instead of a manual toggle that resets
// every time the sidebar reopens. Any reminder text NOT listed here has no
// clear real-world signal to check against (e.g. "Did you check who to
// resend documents?") and stays a manual, freely-toggled checkbox —
// still persisted per-client via localStorage (see MANUAL_STORAGE_PREFIX
// below) rather than silently resetting, but nobody else's activity can
// check it off for you.
const ITEM_SIGNAL_RESOLVERS = {
  "Did comment on the activity thread?": (s) => s.commentedToday,
  "Did you check valid id's?": (s) => s.idsValid,
  "Did you take a picture of cfpb id?": (s) => s.cfpbCompleted,
  "Did you start inquiries?": (s) => s.startInquiriesSet,
  "Did you classify the inquiries?": (s) => s.classifiedInquiries,
  "Did you note the representative's name?": (s) => s.repNameLogged,
  "Did you ask for a supervisor?": (s) => s.supervisorAsked,
  "Did you mark the client in the pending callbacks?": (s) => s.callbackMarked,
};

const MANUAL_STORAGE_PREFIX = "hpc_checklist_manual";
const manualStorageKey = (clientId, reminder) => `${MANUAL_STORAGE_PREFIX}:${clientId}:${reminder}`;

export default function RemindersSidebar({ clientId, isOpen, onClose, onRefresh }) {
  const { addToast } = useToast();
  // Permission-based (utils/permissions.js). This used to destructure
  // `isDocs` from useAuth() for a "Docs" role that was never actually
  // exposed there — always undefined, so the Log Document option silently
  // depended entirely on isAdmin/isOwner/isSubAdmin. Fixed by gating on the
  // actual document permission instead of a role that never worked.
  const { hasAnyPermission } = useAuth();
  const canLogCall = hasAnyPermission(["complete_call_task", "view_call_queue"]);
  const canLogDocument = hasAnyPermission(["upload_documents", "view_documents"]);
  const canCount = hasAnyPermission(["count_inquiries", "view_credit_reports"]);
  const canGeneralReview = hasAnyPermission(["edit_client", "view_all_clients"]);

  const activityReminders = {
    logCall: [
      "Did you mark the client in the pending callbacks?",
      "Did you note the representative's name?",
      "Did you ask for a supervisor?",
      "Did comment on the activity thread?",
    ],
    logDocument: [
      "Did you check valid id's?",
      "Did you check who to resend documents?",
      "Did you take a picture of cfpb id?",
      "Did comment on the activity thread?",
    ],
    count: [
      "Did you classify the inquiries?",
      "Did you check the credit report for accuracy?",
      "Did you start inquiries?",
      "Did comment on the activity thread?",
    ],
    checking: [
      "Did you review all recent activity?",
      "Did you check for client messages?",
      "Did you verify next steps?",
      "Did you update any statuses?",
    ],
  };

  const activityTypeLabels = {
    logCall: "Call Logging",
    logDocument: "Document Processing",
    count: "Bureau Counting",
    checking: "General Review",
    default: "General Task",
  };
  
  const [activityType, setActivityType] = useState("");
  const [checkedItems, setCheckedItems] = useState({});
  const [reminders, setReminders] = useState([]);
  const [activeModal, setActiveModal] = useState(null);
  // Also refreshes checklist signals on close — LogCallModal/LogDocumentModal
  // can change the exact data those signals read (rep name, supervisor,
  // callback date), so the checklist should reflect it immediately instead
  // of waiting for the sidebar to be reopened.
  const closeModal = () => {
    setActiveModal(null);
    refreshSignals();
  };
  // Fetch3BModal/ParseReportModal only call onClose themselves when no
  // onSaved is given (see their own success handlers) — so this has to
  // close the modal itself too, same as ClientHeader.jsx's
  // handleModalSave for the same two modals, just reached from the
  // Reminders sidebar instead of the header's Fetch/Parse buttons.
  const handleImportSaved = () => {
    onRefresh && onRefresh();
    closeModal();
  };
  const [clientReady, setClientReady] = useState(false);

  // Real-world signals the checklist checkboxes above bind to instead of a
  // manual toggle that forgets itself — see ITEM_SIGNAL_RESOLVERS. Bumping
  // signalsRefreshKey re-runs the load effect below (e.g. right after a
  // comment gets posted through this sidebar's own Activity Thread), so a
  // just-completed action shows as checked without needing to close and
  // reopen the sidebar.
  const [signals, setSignals] = useState({});
  const [signalsRefreshKey, setSignalsRefreshKey] = useState(0);
  const refreshSignals = useCallback(() => setSignalsRefreshKey((k) => k + 1), []);

  const checklistIncomplete =
    isOpen && activityType && !Object.values(checkedItems).every(Boolean);
    
  usePrompt(
    "You haven’t completed all reminders. Are you sure you want to leave?",
    checklistIncomplete
  );

  const updateStartInquiriesText = async () => {
    const text = prompt("Enter Start Inquiries note:");
    if (!text) return;

    const { error } = await supabase
      .from("clients")
      .update({ start_inquiries: text })
      .eq("id", clientId);

    if (error) {
      addToast({ title: "Update Failed", message: "Failed to update start inquiries: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } else {
      addToast({ title: "Updated", message: "Start inquiries note updated.", variant: "success", icon: "bi-check-circle-fill" });
    }
  };

  useEffect(() => {
    if (!activityType) return;
    const currentReminders =
      activityReminders[activityType] || activityReminders.default;
    setReminders(currentReminders);
    // Real-signal items are computed from `signals` (defaults to
    // false/unknown until the load effect below finishes — it'll flip to
    // the real value and this effect re-runs since `signals` is a dep).
    // Manual items read whatever was last saved for THIS client+reminder
    // in localStorage, so re-selecting a task (or reopening the sidebar
    // later) doesn't wipe a check that isn't backed by real data either.
    setCheckedItems(
      currentReminders.reduce((acc, reminder) => {
        const resolver = ITEM_SIGNAL_RESOLVERS[reminder];
        acc[reminder] = resolver
          ? !!resolver(signals)
          : localStorage.getItem(manualStorageKey(clientId, reminder)) === "true";
        return acc;
      }, {})
    );
  }, [activityType, signals, clientId]);

  // Combined readiness-check + checklist-signal load — merged into one
  // effect/query set since both need the same `clients` row and
  // `client_documents` rows, rather than fetching them twice.
  useEffect(() => {
    const loadReadinessAndSignals = async () => {
      if (!clientId || !isOpen) return;

      // Missing-column fallback for `counted_at` (sql/add_counted_at.sql
      // may not have been run everywhere yet) — this query used to have no
      // fallback at all, so on a missing column it returned client: null
      // and silently made EVERY client show as "not ready" (the whole
      // Select Task dropdown disables on that), not just the one signal
      // that actually depends on counted_at. Degrading to "no
      // classifiedInquiries signal" instead matches how the
      // client_documents/validation_status fallback just below already
      // handles the same kind of not-yet-migrated column.
      let { data: client, error: clientErr } = await supabase
        .from("clients")
        .select("ssn, dob, address, company_id, admin_id, start_inquiries, counted_at")
        .eq("id", clientId)
        .single();

      if (clientErr && /counted_at/i.test(clientErr.message || "")) {
        const fallback = await supabase
          .from("clients")
          .select("ssn, dob, address, company_id, admin_id, start_inquiries")
          .eq("id", clientId)
          .single();
        client = fallback.data;
        clientErr = fallback.error;
      }
      if (clientErr) {
        console.warn("Could not load client for checklist readiness:", clientErr.message);
      }

      const hasRequiredInfo =
        client &&
        client.ssn?.trim() &&
        client.dob?.trim() &&
        client.address?.trim() &&
        client.company_id &&
        client.admin_id;

      // ID validity — license/SSN/POA (utils/documentAssetLabels.js#ASSET_KEYS)
      // all need validation_status === "valid". Missing-column fallback
      // matches LetterEditorModal.jsx's loadAssetDocs (sql/add_document_validation.sql
      // may not have been run everywhere yet) — degrades to "just count docs",
      // same as this sidebar's old readiness check did before this signal existed.
      let idsValid = false;
      let hasAtLeastTwoDocs = false;
      try {
        let { data: docs, error: docsErr } = await supabase
          .from("client_documents")
          .select("file_name, validation_status")
          .eq("client_id", clientId)
          .in("file_name", ASSET_KEYS)
          .order("created_at", { ascending: false });

        if (docsErr && /validation_status/i.test(docsErr.message || "")) {
          const fallback = await supabase
            .from("client_documents")
            .select("file_name")
            .eq("client_id", clientId)
            .in("file_name", ASSET_KEYS);
          docs = (fallback.data || []).map((d) => ({ ...d, validation_status: null }));
        }

        const latestByKey = {};
        (docs || []).forEach((d) => { if (!latestByKey[d.file_name]) latestByKey[d.file_name] = d; });
        idsValid = ASSET_KEYS.every((k) => latestByKey[k]?.validation_status === "valid");

        const { count: allDocsCount } = await supabase
          .from("client_documents")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId);
        hasAtLeastTwoDocs = (allDocsCount || 0) >= 2;
      } catch (e) {
        console.warn("Could not load document validation status for checklist:", e?.message || e);
      }

      // CFPB checkbox — the same document_routing.cfpb_completed flipped
      // in Docs Routing (see LogChecklistItemModal.jsx), on the client's
      // latest round.
      let cfpbCompleted = false;
      try {
        const { data: latestDoc } = await supabase
          .from("document_routing")
          .select("cfpb_completed")
          .eq("client_id", clientId)
          .order("round_count", { ascending: false })
          .limit(1)
          .maybeSingle();
        cfpbCompleted = !!latestDoc?.cfpb_completed;
      } catch (e) {
        console.warn("Could not load document_routing for checklist:", e?.message || e);
      }

      // Posted anything to the Activity Thread today (any admin, not just
      // this session) — matches how "today" is scoped everywhere else in
      // this app (calendar day, not a rolling 24h window).
      let commentedToday = false;
      try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const { count } = await supabase
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .gte("timestamp", startOfToday.toISOString());
        commentedToday = (count || 0) > 0;
      } catch (e) {
        console.warn("Could not load comments for checklist:", e?.message || e);
      }

      // Most recent call log, any bureau — reps/supervisor/callback are
      // stored per-bureau (exp_/tu_/eq_ prefix, see LogCallModal.jsx's
      // payload), so this checks whichever bureau that call was actually
      // logged against.
      let repNameLogged = false, supervisorAsked = false, callbackMarked = false;
      try {
        const { data: lastCall } = await supabase
          .from("call_logs")
          .select("exp_rep_name, tu_rep_name, eq_rep_name, exp_supervisor_name, tu_supervisor_name, eq_supervisor_name, exp_callback_date, tu_callback_date, eq_callback_date")
          .eq("client_id", clientId)
          .order("call_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastCall) {
          repNameLogged = !!(lastCall.exp_rep_name || lastCall.tu_rep_name || lastCall.eq_rep_name);
          supervisorAsked = !!(lastCall.exp_supervisor_name || lastCall.tu_supervisor_name || lastCall.eq_supervisor_name);
          callbackMarked = !!(lastCall.exp_callback_date || lastCall.tu_callback_date || lastCall.eq_callback_date);
        }
      } catch (e) {
        console.warn("Could not load call_logs for checklist:", e?.message || e);
      }

      setClientReady(hasRequiredInfo && hasAtLeastTwoDocs);
      setSignals({
        idsValid,
        cfpbCompleted,
        commentedToday,
        startInquiriesSet: !!client?.start_inquiries?.trim?.(),
        classifiedInquiries: !!client?.counted_at,
        repNameLogged,
        supervisorAsked,
        callbackMarked,
      });
    };

    loadReadinessAndSignals();
  }, [clientId, isOpen, signalsRefreshKey]);

  // Auto-tracked (resolver-backed) items reflect real data and can't be
  // hand-toggled — see ITEM_SIGNAL_RESOLVERS and the disabled checkbox in
  // the render below. Manual items persist per-client to localStorage so
  // they survive closing/reopening the sidebar instead of resetting.
  const handleCheckboxChange = (reminder) => {
    if (ITEM_SIGNAL_RESOLVERS[reminder]) return;
    setCheckedItems((prev) => {
      const next = !prev[reminder];
      try {
        localStorage.setItem(manualStorageKey(clientId, reminder), String(next));
      } catch (e) {
        console.warn("Could not persist manual checklist item:", e?.message || e);
      }
      return { ...prev, [reminder]: next };
    });
  };

  const renderActionButtons = () => {
    switch (activityType) {
      case "logCall":
        return (
          <Button
            variant="danger"
            className="me-2 fw-bold w-100 mb-2"
            onClick={() => setActiveModal("logCall")}
          >
            Dont Forget to Log Call!
          </Button>
        );
      case "logDocument":
        return (
          <Button
            variant="danger"
            className="me-2 fw-bold w-100 mb-2"
            onClick={() => setActiveModal("logDoc")}
          >
            Dont Forget to Log Document!
          </Button>
        );
      case "count":
        return (
          <div className="d-flex flex-column gap-2 mb-2">
            <div className="d-flex gap-2">
                <Button
                variant="primary"
                className="flex-fill fw-bold"
                onClick={() => setActiveModal("fetch3b")}
                >
                Smart Credit
                </Button>
                <Button variant="primary" className="flex-fill fw-bold" onClick={() => setActiveModal("parseIq")}>
                Identity IQ
                </Button>
            </div>
            <button
              className="btn btn-outline-info fw-bold w-100"
              onClick={updateStartInquiriesText}
            >
              <i className="bi bi-pencil-square me-2"></i>
              Edit Start Inquiries
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  const modalComponents = {
    fetch3b: (
      <Fetch3BModal show={true} onClose={closeModal} clientId={clientId} onSaved={handleImportSaved} />
    ),
    parseIq: (
      <ParseReportModal show={true} onClose={closeModal} clientId={clientId} onSaved={handleImportSaved} />
    ),
    logCall: (
      <LogCallModal show={true} onClose={closeModal} clientId={clientId} />
    ),
    logDoc: (
      <LogDocumentModal show={true} onClose={closeModal} clientId={clientId} />
    ),
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="sidebar-overlay" />
      <div className="reminders-sidebar" style={{ backgroundColor: '#0B1121' }}>
        <div className="sidebar-header d-flex justify-content-between align-items-center p-3 border-bottom" style={{ borderColor: '#1e293b' }}>
          <h5 className="mb-0 text-white fw-bold"><i className="bi bi-card-checklist me-2 text-info"></i>Activity Checklist</h5>
          <Button variant="link" onClick={onClose} className="p-0 text-decoration-none">
            <i className="bi bi-x-lg text-white fs-5"></i>
          </Button>
        </div>

        <div className="sidebar-body p-3 text-white overflow-auto h-100">
          <Form.Group className="mb-4">
            <Form.Label className="text-muted fw-bold small text-uppercase">Select Task</Form.Label>
            <Form.Select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              disabled={!clientReady}
              className="bg-dark text-white border-secondary shadow-sm"
            >
              <option value="">Choose an activity...</option>

              {canLogCall && <option value="logCall">Log Call</option>}

              {canLogDocument && (
                <option value="logDocument">Log Document</option>
              )}

              {canCount && <option value="count">Count Inquiries</option>}

              {canGeneralReview && (
                <option value="checking">General Review</option>
              )}
            </Form.Select>

            {!clientReady && (
              <Alert variant="warning" className="mt-3 small fw-bold shadow-sm py-2">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                To enable actions, ensure SSN, DOB, Address, Company, Admin, and Docs (x2) are attached.
              </Alert>
            )}
          </Form.Group>

          {activityType && (
            <>
              <Badge bg="info" className="mb-3 text-dark fw-bold px-3 py-2 fs-6 w-100 text-start shadow-sm">
                <i className="bi bi-arrow-right-circle-fill me-2"></i>{activityTypeLabels[activityType]}
              </Badge>
              
              <p className="small text-muted mb-2 fw-bold text-uppercase">
                Check off items as you complete them:
              </p>

              <ListGroup className="dark-checklist mb-4 shadow-sm">
                {reminders.map((reminder) => {
                  const isAuto = !!ITEM_SIGNAL_RESOLVERS[reminder];
                  return (
                  <ListGroup.Item
                    key={reminder}
                    className="d-flex align-items-center justify-content-between py-3"
                  >
                    <Form.Check
                      type="checkbox"
                      id={`check-${reminder}`}
                      label={reminder}
                      checked={checkedItems[reminder]}
                      onChange={() => handleCheckboxChange(reminder)}
                      disabled={isAuto}
                      className="w-100 m-0"
                    />
                    {isAuto && (
                      <span
                        className="badge bg-dark border border-info text-info small ms-2 flex-shrink-0"
                        title="Tracked automatically from real activity — you don't need to check this yourself"
                      >
                        <i className="bi bi-link-45deg me-1"></i>Auto
                      </span>
                    )}
                  </ListGroup.Item>
                  );
                })}
              </ListGroup>

              <div className="mt-4 pt-3 border-top" style={{ borderColor: '#1e293b' }}>
                  {renderActionButtons()}
              </div>

              {/* Dynamic modal renderer */}
              {activeModal && modalComponents[activeModal]}
              
              {clientReady && (
                <div className="mt-4 pt-3 border-top" style={{ borderColor: '#1e293b' }}>
                  <CommentsSection clientId={clientId} onCommentPosted={refreshSignals} />
                </div>
              )}

              <div className="mt-4 pb-5 d-flex justify-content-between">
                <Button
                  variant={Object.values(checkedItems).every(Boolean) ? "success" : "secondary"}
                  className="w-100 fw-bold py-2 shadow-sm"
                  onClick={onClose}
                  disabled={!Object.values(checkedItems).every(Boolean)}
                >
                  {Object.values(checkedItems).every(Boolean)
                    ? <><i className="bi bi-check-all me-2"></i> All Done! Close</>
                    : "Complete Checklist First"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}