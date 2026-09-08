import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import { Badge, Alert, Dropdown, Button, Modal, Form, InputGroup, Spinner } from "react-bootstrap";

import { useAuth } from "../../../context/AuthContext";
import { useClient } from "../../../hooks/useClient";
import { useToast } from "../../shared/ui/ToastNotifier";
import { saveUpdateAudit } from "../../../utils/reportStorage";
import { serviceLabel, resolveServiceId } from "../../../utils/services";

// Extracted hooks
import { usePiReveal } from "../../../hooks/usePiReveal";
import { useClientActions } from "../../../hooks/useClientActions";
import { useReceiptGenerator } from "../../../hooks/useReceiptGenerator";
import { useClassicReportLink } from "../../../hooks/useClassicReportLink";
import { useAuthorizationHolds } from "../../../hooks/useAuthorizationHolds";
import { useAlignmentDocs } from "../../../hooks/useAlignmentDocs";

import useInquiriesThread from "../../../hooks/useInquiriesThread";

// Modals
import Fetch3BModal from "./modals/Fetch3bModal";
import LogCallModal from "./modals/LogCallModal";
import LogDocumentModal from "./modals/LogDocumentModal";
import ParseReportModal from "./modals/ParseRreportModal";
import SSNManagerModal from "./modals/SSNManagerModal";
import InvoiceGeneratorModal from "./modals/InvoiceGeneratorModal";
import ManagerOverrideModal from "./modals/ManagerOverrideModal";
import RegenerateHistoryBtn from "../RegenerateHistoryBtn";

const COMPLETION_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/423af280-1504-4014-9f5e-f10b9bbc0985";

// Matches AlignmentCheckPanel.jsx's identityRows labels — kept as a small
// local copy here rather than importing from a component file, since
// these are just display labels for the docIssues badges below. Keyed by
// the merged identity SLOT (useAlignmentDocs.js), not doc_type, so an
// LTOS-origin document (e.g. a passport merged into the "license" slot)
// still gets a sensible label.
const DOC_LABELS = { license: "Photo ID", ssn: "SSN Card", poa: "Proof of Address", authorization: "Authorization (LPOA)" };
const DOC_STATUS_LABELS = { expired: "Expired", invalid: "Invalid", needs_review: "Needs Review" };

// AI-extracted SSN comes back as 9 raw digits (no dashes — see
// supabase/functions/validate-document's extractedSsn) — formatted the
// same as clients.ssn is displayed elsewhere so the two are easy to
// compare at a glance.
function formatSsn(digits) {
  const clean = (digits || "").replace(/\D/g, "");
  if (clean.length !== 9) return digits;
  return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5)}`;
}

// ─── Small pure helpers ───────────────────────────────────────────────────────

const standardizeAgentName = (name) => {
  if (!name) return "N/A";
  const low = name.trim().toLowerCase();
  return ["n/a", "na", "-", "—", "unassigned", "null", ""].includes(low) ? "N/A" : name.trim();
};

const FormatNotes = ({ notes }) =>
  notes
    ? notes.split("\n").map((line, i) => <span key={i}>{line}<br /></span>)
    : null;

function MaskedValue({ value, revealed, placeholder = "••••••••" }) {
  if (!revealed) {
    return (
      <span className="fw-bold text-end" style={{ whiteSpace: "pre-wrap" }}>
        <span
          className="user-select-none"
          style={{ filter: "blur(6px)", textShadow: "0 0 6px rgba(0,0,0,0.25)", display: "inline-block", minWidth: "6ch" }}
          aria-hidden="true"
        >{placeholder}</span>
      </span>
    );
  }
  return <span className="fw-bold text-end" style={{ whiteSpace: "pre-wrap" }}>{value || "—"}</span>;
}

// ─── Receipt Preview Modal ────────────────────────────────────────────────────

function ReceiptPreviewModal({ receipt }) {
  const { preview, customPrice, setCustomPrice, isSending, confirmGenerate, dismiss } = receipt;
  return (
    <Modal show={!!preview} onHide={dismiss} centered>
      <Modal.Header closeButton={!isSending} className="bg-dark text-white border-0">
        <Modal.Title className="fs-5"><i className="bi bi-calculator me-2" />Review Receipt Pricing</Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-light">
        {preview && (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3 p-3 bg-white border rounded shadow-sm">
              <div>
                <h6 className="mb-0 text-muted text-uppercase fw-bold" style={{ fontSize: "0.75rem" }}>Disputable Inquiries Found</h6>
                <div className="fs-3 fw-bold text-dark">{preview.totalCount}</div>
              </div>
              <div className="text-end">
                {[["EXP", preview.expCount], ["TU", preview.tuCount], ["EQ", preview.eqCount]].map(([label, count]) => (
                  <div key={label} className="small text-muted">{label}: <span className="fw-bold text-dark">{count}</span></div>
                ))}
              </div>
            </div>
            <Alert variant="info" className="py-2 border-info border-opacity-25 shadow-sm">
              <i className="bi bi-info-circle-fill me-2" />
              Pricing applied: <strong>{preview.pricingDetails.pricingModelApplied}</strong>
            </Alert>
            <Form.Group className="mb-3">
              <Form.Label className="fw-bold text-muted small text-uppercase">Final Invoice Amount ($)</Form.Label>
              <InputGroup size="lg" className="shadow-sm">
                <InputGroup.Text className="bg-white border-end-0 fw-bold text-success">$</InputGroup.Text>
                <Form.Control
                  type="number"
                  className="border-start-0 fw-bold fs-4 text-dark"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  disabled={isSending}
                />
              </InputGroup>
              <Form.Text className="text-muted mt-2 d-block">
                System calculated <strong>${preview.pricingDetails.grandTotal}</strong> based on the partner's matrix.
              </Form.Text>
            </Form.Group>
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-light border-0">
        <Button variant="outline-secondary" className="fw-bold" onClick={dismiss} disabled={isSending}>Cancel</Button>
        <Button variant="warning" className="fw-bold px-4" onClick={confirmGenerate} disabled={isSending || !customPrice}>
          {isSending
            ? <><Spinner size="sm" className="me-2" />Sending...</>
            : <><i className="bi bi-send-fill me-2" />Confirm & Generate</>}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ─── Round Switcher ───────────────────────────────────────────────────────────
// A returning client (same email, new engagement) gets a NEW clients row
// per round rather than reusing the old one — see utils/clientDuplicateRound.js.
// This surfaces that history: if the current client's email matches more
// than one row, shows a dropdown to jump between rounds; otherwise just a
// quiet "Round 1" badge so the number is still visible.
function RoundSwitcher({ clientId, email, currentRound }) {
  const navigate = useNavigate();
  const [rounds, setRounds] = useState([]);

  useEffect(() => {
    if (!email) { setRounds([]); return; }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, dispute_round")
        .ilike("email", email.trim().toLowerCase())
        .order("dispute_round", { ascending: true });
      if (active) setRounds(data || []);
    })();
    return () => { active = false; };
  }, [email]);

  if (rounds.length <= 1) {
    return (
      <Badge bg="dark" className="ms-2 shadow-sm border border-secondary">
        Round {currentRound || 1}
      </Badge>
    );
  }

  return (
    <Form.Select
      size="sm"
      className="ms-2 d-inline-block w-auto bg-dark text-white border-secondary shadow-sm"
      style={{ fontSize: "0.85rem" }}
      value={clientId}
      onChange={(e) => {
        if (e.target.value !== clientId) navigate(`/clients/${e.target.value}`);
      }}
    >
      {rounds.map((r) => (
        <option key={r.id} value={r.id}>
          Round {r.dispute_round || 1}{r.id === clientId ? " (current)" : ""}
        </option>
      ))}
    </Form.Select>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientHeader({ clientId, onEdit, readonly = false, onRefresh, refreshKey }) {
  const { hasPermission } = useAuth();
  const canEdit = !readonly && hasPermission("edit_client");

  const { client, loading, error, refetch } = useClient(clientId);
  const { addToast } = useToast();

  const [activeModal, setActiveModal] = useState(null);
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [agentDisplay, setAgentDisplay] = useState("Loading...");
  const [timeLeft, setTimeLeft] = useState(null);
  const intervalRef = useRef(null);

  // Extracted hooks
  const pi = usePiReveal(canEdit);
  const actions = useClientActions(clientId, client, refetch, onRefresh);
  const receipt = useReceiptGenerator(clientId, agentDisplay, refetch, onRefresh);
  const classicReport = useClassicReportLink(clientId, refetch);

  // Hook for thread logic
  const { markAllNonLinkedAsDeleted, markAllNonLinkedAsDND } = useInquiriesThread({ clientId });

  // HPC Ops Sprint Priority 1 (Inquiry Authorization Protection) — see
  // utils/authorizationHold.js. `pendingBureauAction` stashes the
  // bureau-complete attempt a hold just blocked, so the Manager Override
  // modal can re-run the exact same action once logged.
  const { holds: authHolds, refetch: refetchAuthHolds } = useAuthorizationHolds(clientId, client);
  const [pendingBureauAction, setPendingBureauAction] = useState(null);

  // AI validity + alignment check (sql/add_document_validation.sql,
  // sql/add_document_alignment_check.sql, supabase/functions/validate-document)
  // — surfaced here so staff sees an expired/invalid/needs-review document,
  // or a name/SSN/address mismatch, the instant they open the client,
  // without needing to scroll to Cover Letter Assets / Alignment Check.
  // Shared with AlignmentCheckPanel.jsx via useAlignmentDocs.js, which
  // also merges in LTOS-origin documents (company portal / public intake
  // uploads) that a doc_type-only query would miss — see that hook's
  // header comment. Warning-only, same as every other badge in this
  // header.
  const { identityDocs } = useAlignmentDocs(clientId, refreshKey);

  // Badge list for the header — any identity doc the AI flagged as
  // expired/invalid/needs-review.
  const docIssues = Object.entries(identityDocs)
    .filter(([, row]) => row && ["expired", "invalid", "needs_review"].includes(row.validation_status))
    .map(([slot, row]) => ({ slot, validation_status: row.validation_status, validation_notes: row.validation_notes }));

  // "AI detected from ID" sub-lines for Personal Info — what the model
  // actually read off the SSN card / proof-of-address document, extracted
  // via supabase/functions/validate-document and stored in
  // validation_details.extractedSsn/extractedAddress (see that file's
  // ALIGNMENT CHECK section). Only SSN and Address have a document that
  // extracts them today — license/identity docs only extract a name.
  const aiSsn = identityDocs.ssn?.validation_details?.extractedSsn || null;
  const aiAddress = identityDocs.poa?.validation_details?.extractedAddress || null;
  const aiSublines = {
    SSN: aiSsn ? { value: formatSsn(aiSsn), matched: identityDocs.ssn.validation_details.ssnMatch, source: "SSN Card" } : null,
    Address: aiAddress ? { value: aiAddress, matched: identityDocs.poa.validation_details.addressMatch, source: "Proof of Address" } : null,
  };

  // There's no "Name" row in the Personal Info list above — the client's
  // name is the page's own title, right in the header. So the AI-detected
  // name (extracted off whichever identity document is on file — Photo ID
  // first, then SSN card, then Proof of Address, in that priority order)
  // is surfaced right under the name itself instead. `nameMatch` is
  // computed identically for every doc type (see the edge function), so
  // picking whichever doc has a value is safe — they're never in conflict
  // for the SAME client since the comparison target (client.full_name) is
  // the same every time.
  const nameSourceDoc = identityDocs.license || identityDocs.ssn || identityDocs.poa || identityDocs.authorization || null;
  const aiName = nameSourceDoc?.validation_details?.extractedName
    ? { value: nameSourceDoc.validation_details.extractedName, matched: nameSourceDoc.validation_details.nameMatch }
    : null;

  // Resolve agent display name
  useEffect(() => {
    if (!client) return;
    (async () => {
      if (client.agent_id) {
        const { data } = await supabase.from("company_user_profiles")
          .select("full_name,agent_code").eq("id", client.agent_id).single();
        if (data) {
          const name = standardizeAgentName(data.full_name);
          setAgentDisplay(name !== "N/A" ? `${name}${data.agent_code ? ` (${data.agent_code})` : ""}` : "Unassigned");
          return;
        }
      }
      const name = standardizeAgentName(client.agent);
      setAgentDisplay(name !== "N/A" ? `${name}${client.agent_code ? ` (${client.agent_code})` : ""}` : "Unassigned");
    })();
  }, [client?.agent_id, client?.agent, client?.agent_code]);

  // Receipt link countdown
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeLeft(null);
    if (!client?.public_token_expires_at) return;

    const expiresAt = new Date(client.public_token_expires_at);
    if (Number.isNaN(expiresAt.getTime())) return;

    const tick = () => {
      const diff = expiresAt - Date.now();
      if (diff <= 0) { clearInterval(intervalRef.current); setTimeLeft("Expired"); refetch(); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => clearInterval(intervalRef.current);
  }, [client?.public_token_expires_at, refetch]);

  // client-updated event
  useEffect(() => {
    const handler = (e) => { if (e?.detail?.id === clientId) refetch(); };
    window.addEventListener("client-updated", handler);
    return () => window.removeEventListener("client-updated", handler);
  }, [clientId, refetch]);

  const closeModal = () => { setActiveModal(null); setIsUpdateMode(false); };

  const handleUpdateComplete = async (rawJson, analysis) => {
    try {
      // handleUpdateComplete is shared by both "Update Existing" modals
      // (see the Reports dropdown below) — activeModal is still set to
      // whichever one is currently open at this point, so it's the
      // cheapest reliable way to tag which provider this snapshot came
      // from without threading a new prop through both modals.
      const provider = activeModal === "parseIq" ? "IdentityIQ" : activeModal === "fetch3b" ? "SmartCredit" : null;
      await saveUpdateAudit(clientId, rawJson, analysis, provider);
      addToast({ title: "Success", message: "Report Updated Successfully! The Progress Chart has been updated.", variant: "success", icon: "bi-check-circle" });
      await refetch();
      if (onRefresh) onRefresh();
    } catch (e) {
      addToast({ title: "Error", message: "Error updating report: " + e.message, variant: "danger", icon: "bi-exclamation-triangle" });
    } finally { closeModal(); }
  };

  const handleModalSave = async () => { await refetch(); if (onRefresh) onRefresh(); closeModal(); };

  const openTab = useCallback((path) => window.open(`${window.location.origin}${path}`, "_blank", "noopener,noreferrer"), []);


  const fireCompletionWebhook = async () => {
      const payload = {
        client: { 
          id: client.id, 
          full_name: client.full_name || "", 
          email: client.email || "", 
          phone: client.phone || "", 
          admin_id: client.admin_id || null, 
          admin_name: client.admin_name || "",
          company_id: client.company_id || null,
          company_name: client.company_name || "",
          agent_id: client.agent_id || null,
          agent_name: client.agent || ""
        },
        statuses: { exp: true, tu: true, eq: true }, 
        completed: { exp: true, tu: true, eq: true }, 
        reason: "all_bureaus_completed_via_button", 
        completed_at: new Date().toISOString(),
      };

      try {
        await fetch(COMPLETION_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
      } catch (e) {
        console.error("❌ Webhook failed:", e);
        try {
            await fetch(COMPLETION_WEBHOOK_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        } catch (e2) {
            console.error("❌ Webhook fallback also failed:", e2);
        }
      }
  };

  // Shared tail for both bureau "Complete" and "N/A" actions — checks
  // whether this action just brought the client to fully done (every
  // bureau completed OR N/A — matching classifyBureauStatus's own
  // definition of "resolved") and fires the one-time completion webhook,
  // then refreshes. No direct exp/tu/eq_completed/_na writes happen here
  // anymore — markAllNonLinkedAsDeleted/markAllNonLinkedAsDND's own save
  // already correctly computed and persisted those via
  // utils/inquiryCounts.js#computeBureauProgress, so re-deriving or
  // overwriting them here would just risk fighting with (and losing to, on
  // the next classification save) whatever's actually classified. This
  // used to check only `client.exp_completed` (never `client.exp_na`),
  // which meant a client already legitimately N/A on one bureau would
  // never register as "fully done" here and could silently miss firing
  // the completion webhook.
  const finalizeBureauAction = async (bureauFull) => {
      const isExpResolved = bureauFull === "Experian" || bureauFull === "All" || client.exp_completed || client.exp_na;
      const isTuResolved = bureauFull === "TransUnion" || bureauFull === "All" || client.tu_completed || client.tu_na;
      const isEqResolved = bureauFull === "Equifax" || bureauFull === "All" || client.eq_completed || client.eq_na;

      const wasAlreadyDone =
          (client.exp_completed || client.exp_na) &&
          (client.tu_completed || client.tu_na) &&
          (client.eq_completed || client.eq_na);

      if (isExpResolved && isTuResolved && isEqResolved && !wasAlreadyDone) {
          await fireCompletionWebhook();
      }

      await refetchAuthHolds();
  };

  // "Mark [Bureau] Complete" — reclassifies remaining actionable items to
  // Deleted and saves through the real classification engine (see
  // useInquiriesThread.js#markAllNonLinkedAsDeleted), which is what
  // actually computes exp_completed/tu_completed/eq_completed now.
  const runBureauComplete = async (bureauFull) => {
      if (markAllNonLinkedAsDeleted) {
          await markAllNonLinkedAsDeleted(bureauFull);
      }
      await finalizeBureauAction(bureauFull);
  };

  // "Mark [Bureau] N/A" — the self-healing counterpart: reclassifies
  // remaining actionable items to Do-Not-Dispute instead of Deleted (see
  // useInquiriesThread.js#markAllNonLinkedAsDND), so exp_na/tu_na/eq_na is
  // derived from classification too, and can't be silently reset back to
  // false by the next classification save the way a direct flag flip could.
  const runBureauNA = async (bureauFull) => {
      if (markAllNonLinkedAsDND) {
          await markAllNonLinkedAsDND(bureauFull);
      }
      await finalizeBureauAction(bureauFull);
  };

  // HPC Ops Sprint Priority 1 (Inquiry Authorization Protection). A bureau
  // is "held" when its disputable count has grown past what's already been
  // approved via Count Review (see utils/authorizationHold.js) — the very
  // first pass on a client is never held (nothing's been approved yet to
  // exceed), only a later overage after a baseline was already established.
  // Non-holders are blocked outright and pointed at Count Review; anyone
  // with override_authorization_hold can log a permanent manager override
  // and proceed anyway. Shared by both "Complete" and "N/A" — reclassifying
  // items away as N/A is just as much a way around Count Review as marking
  // them deleted would be, so it needs the same gate.
  const handleBureauAction = async (bureauFull, actionType) => {
      const relevantHolds = authHolds.filter((h) => bureauFull === "All" || h.bureau === bureauFull);
      const run = actionType === "na" ? runBureauNA : runBureauComplete;

      if (relevantHolds.length === 0) {
          await run(bureauFull);
          return;
      }

      if (!hasPermission("override_authorization_hold")) {
          addToast({
              title: "Authorization Hold",
              message: `${relevantHolds.map((h) => `${h.bureau} (+${h.additionalNeeded})`).join(", ")} — pending Count Review approval before this can be marked complete.`,
              variant: "danger",
              icon: "bi-shield-lock-fill",
              timeout: 9000,
          });
          return;
      }

      setPendingBureauAction({ bureauFull, actionType, holds: relevantHolds });
  };

  // Back-compat alias — "Complete" is the more common case throughout the
  // JSX below.
  const handleBureauComplete = (bureauFull) => handleBureauAction(bureauFull, "complete");
  const handleBureauNA = (bureauFull) => handleBureauAction(bureauFull, "na");

  const handleOverrideConfirmed = async () => {
      if (!pendingBureauAction) return;
      const { bureauFull, actionType } = pendingBureauAction;
      setPendingBureauAction(null);
      await (actionType === "na" ? runBureauNA(bureauFull) : runBureauComplete(bureauFull));
  };

  // Fraud Alert Removal / Personal Identifiers are also worked bureau-by-
  // bureau (the alert/update goes out to each bureau separately), but there
  // are no disputed inquiries behind them to reclassify — so unlike
  // runBureauComplete/runBureauNA above, these just flip the bureau's
  // completed/na flag directly (see useClientActions.js#markBureauComplete/
  // markBureauNA) rather than running the classification engine. No
  // Authorization Hold gating either — that gate exists to protect Count
  // Review on disputed-inquiry counts, which don't exist for these
  // services. Still funnels through the same finalizeBureauAction so the
  // one-time completion webhook and Authorization Hold refetch behave
  // identically once all three bureaus are resolved.
  const BUREAU_KEY = { Experian: "exp", TransUnion: "tu", Equifax: "eq" };

  const runDirectBureauComplete = async (bureauFull) => {
      await actions.markBureauComplete(bureauFull === "All" ? "all" : BUREAU_KEY[bureauFull]);
      await finalizeBureauAction(bureauFull);
  };

  const runDirectBureauNA = async (bureauFull) => {
      await actions.markBureauNA(bureauFull === "All" ? "all" : BUREAU_KEY[bureauFull]);
      await finalizeBureauAction(bureauFull);
  };


  const modalComponents = {
    fetch3b: <Fetch3BModal show onClose={closeModal} onSaved={handleModalSave} clientId={clientId} isUpdateMode={isUpdateMode} onCustomSave={isUpdateMode ? handleUpdateComplete : undefined} />,
    logCall: <LogCallModal show onClose={closeModal} clientId={clientId} />,
    logDoc:  <LogDocumentModal show onClose={closeModal} clientId={clientId} />,
    parseIq: <ParseReportModal show onClose={closeModal} onSaved={handleModalSave} clientId={clientId} isUpdateMode={isUpdateMode} onCustomSave={isUpdateMode ? handleUpdateComplete : undefined} />,
    ssnManager: <SSNManagerModal show onClose={closeModal} clientId={clientId} onSaved={handleModalSave} />,
    generateInvoice: <InvoiceGeneratorModal show onClose={closeModal} client={client} />,
  };

  if (loading) return <div>Loading client details...</div>;
  if (error)   return <div className="alert alert-danger">Error loading client: {error}</div>;
  if (!client) return <div className="alert alert-warning">Client not found.</div>;

  // Every current service (see utils/services.js) is worked bureau-by-
  // bureau, so all four get the "Bureaus" dropdown (Mark All Complete /
  // EXP/TU/EQ Complete/N/A) instead of a single whole-file button — the
  // single Mark Complete button used to be the only option for Fraud Alert
  // Removal/Personal Identifiers, which didn't match how those services are
  // actually done (per bureau) and led admins to close the whole file when
  // they only meant to finish one bureau. The two groups differ only in
  // *how* a bureau gets marked done:
  //  - Inquiry Deletion / Credit Repair ("classification" services): the
  //    dropdown reclassifies the bureau's disputed inquiries (see
  //    runBureauComplete/runBureauNA below) — completed/na is derived from
  //    real classification data.
  //  - Fraud Alert Removal / Personal Identifiers ("direct" services): there
  //    are no disputed inquiries behind them, so the dropdown just flips
  //    the bureau's completed/na flag directly (see
  //    runDirectBureauComplete/runDirectBureauNA above).
  const serviceId = resolveServiceId(client);
  const isBureauService = serviceId === "inquiry_deletion" || serviceId === "credit_repair";
  const isDirectBureauService = serviceId === "fraud_alert_removal" || serviceId === "personal_identifiers";
  const onBureauComplete = isDirectBureauService ? runDirectBureauComplete : handleBureauComplete;
  const onBureauNA = isDirectBureauService ? runDirectBureauNA : handleBureauNA;

  return (
    <>
      <ReceiptPreviewModal receipt={receipt} />

      <div className="card shadow-sm mb-4 border-0">
        {/* ── Card Header ── */}
        <div className="card-header bg-primary text-white py-3">
          <h3 className="mb-0 d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center">
            <div className="d-flex flex-column">
              {/* Name + status badges */}
              <div className="d-flex align-items-center flex-wrap mb-1">
                <i className="bi bi-person-circle me-2" />
                <span className="fw-bold">{client.full_name}</span>
                <Badge bg={client.is_paid ? "success" : "danger"} className="ms-3">{client.is_paid ? "Paid" : "Unpaid"}</Badge>
                <RoundSwitcher clientId={clientId} email={client.email} currentRound={client.dispute_round} />
                {client.is_paused && <Badge bg="warning" text="dark" className="ms-2 shadow-sm"><i className="bi bi-pause-fill me-1" />PAUSED</Badge>}
                {client.is_paid && (
                  <>
                    {client.exp_na ? <Badge bg="secondary" className="ms-2 shadow-sm">EXP N/A</Badge> : client.exp_completed ? <Badge bg="success" className="ms-2 shadow-sm">EXP DONE</Badge> : null}
                    {client.tu_na  ? <Badge bg="secondary" className="ms-2 shadow-sm">TU N/A</Badge>  : client.tu_completed  ? <Badge bg="success" className="ms-2 shadow-sm">TU DONE</Badge>  : null}
                    {client.eq_na  ? <Badge bg="secondary" className="ms-2 shadow-sm">EQ N/A</Badge>  : client.eq_completed  ? <Badge bg="success" className="ms-2 shadow-sm">EQ DONE</Badge>  : null}
                  </>
                )}
              </div>

              {/* AI-extracted name from the identity document on file —
                  see aiName above. Sits right under the client's name so a
                  mismatch (e.g. a misspelled name, or the wrong person's ID
                  uploaded) is impossible to miss. */}
              {aiName && (
                <div className="d-flex align-items-center flex-wrap mb-2">
                  <Badge bg={aiName.matched === false ? "danger" : aiName.matched === true ? "success" : "secondary"} className="shadow-sm">
                    <i className={`bi ${aiName.matched === false ? "bi-exclamation-triangle-fill" : aiName.matched === true ? "bi-patch-check-fill" : "bi-robot"} me-1`} />
                    AI detected from ID: {aiName.value}
                  </Badge>
                </div>
              )}

              {/* Priority 1 (Authorization Protection) — a bureau shows up
                  here once its disputable count has grown past what's
                  already approved via Count Review. See
                  utils/authorizationHold.js. */}
              {authHolds.length > 0 && (
                <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
                  {authHolds.map((h) => (
                    <Badge key={h.bureau} bg="danger" className="shadow-sm" title="Pending Count Review approval, or a manager override, before this can be marked complete">
                      <i className="bi bi-shield-lock-fill me-1"></i>
                      {h.bureau}: {h.actualCount} found · {h.approvedCount} approved · +{h.additionalNeeded} needs authorization
                    </Badge>
                  ))}
                </div>
              )}

              {/* 👇 NEW: Credit Logins Badges 👇 */}
              {(client.report_email || client.report_password) && (
                <div className="d-flex align-items-center flex-wrap mb-2 mt-1">
                  <small className="text-white-50 me-2 fw-medium"><i className="bi bi-key-fill me-1"></i>Credit Logins:</small>
                  {client.report_email && <Badge bg="light" text="dark" className="me-2 shadow-sm font-monospace">{client.report_email}</Badge>}
                  {client.report_password && <Badge bg="light" text="dark" className="shadow-sm font-monospace">{client.report_password}</Badge>}
                </div>
              )}

              {/* Receipt link / Invoice actions */}
              {!readonly && (
                <div className="mt-2 text-muted small d-flex flex-wrap align-items-center gap-2">
                  <div>
                    {client.public_token && client.public_token_expires_at && timeLeft !== "Expired" ? (
                      <>
                        <span className="me-2 text-light opacity-75">📄 Receipt link:</span>
                        <a href={`/receipt/${client.public_token}`} target="_blank" rel="noopener noreferrer" className="text-warning text-decoration-underline fw-bold">View Receipt</a>
                        <span className="ms-2 text-light opacity-75">(expires in {timeLeft ?? "unknown"})</span>
                      </>
                    ) : (
                      <button className="btn btn-sm btn-dark border-secondary text-warning" onClick={receipt.preparePreview} disabled={!canEdit || receipt.isPreparing}>
                        {receipt.isPreparing ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-link-45deg me-1" />}
                        Generate Receipt Link
                      </button>
                    )}
                  </div>
                  <button className="btn btn-sm btn-dark border-secondary text-info" onClick={() => setActiveModal("generateInvoice")} disabled={!canEdit}>
                    <i className="bi bi-receipt me-1" />Invoice Generator
                  </button>
                  <button className="btn btn-sm btn-dark border-secondary text-primary" onClick={classicReport.generateLink} disabled={!canEdit || classicReport.generating}>
                    {classicReport.generating ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-file-earmark-bar-graph me-1" />}
                    Classic Report Link
                  </button>
                </div>
              )}
            </div>

            {/* Running days */}
            <small className="text-light opacity-75 text-end mt-3 mt-sm-0 bg-dark bg-opacity-25 p-2 rounded border border-light border-opacity-10">
              <div className="mb-1"><i className="bi bi-calendar-event me-1" /> {client.createdAtFormatted}</div>
              <div className={client.is_paused ? "text-warning fw-bold" : "fw-bold text-white"}>
                {client.is_paused ? "⏸️ " : "⏳ "}
                {client.is_paid ? `${client.runningDays ?? 0} days ${client.is_paused ? "total (Paused)" : "running"}` : "Pending Payment"}
              </div>
            </small>
          </h3>
        </div>

        {/* ── Card Body ── */}
        {!readonly && (
          <div className="card-body">
            {client.recent_apps_notes && (
              <Alert variant="warning" className="mb-3 shadow-sm">
                <Alert.Heading className="h6 fw-bold"><i className="bi bi-exclamation-triangle-fill me-2" />Do Not Remove These Inquiries</Alert.Heading>
                <hr className="my-2" /><p className="mb-0 small"><FormatNotes notes={client.recent_apps_notes} /></p>
              </Alert>
            )}
            {client.special_instructions_notes && (
              <Alert variant="info" className="mb-3 shadow-sm">
                <Alert.Heading className="h6 fw-bold"><i className="bi bi-info-circle-fill me-2" />Special Instructions</Alert.Heading>
                <hr className="my-2" /><p className="mb-0 small"><FormatNotes notes={client.special_instructions_notes} /></p>
              </Alert>
            )}

            <div className="row g-4">
              {/* ── Personal Info column ── */}
              <div className="col-md-6 d-flex flex-column">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="text-muted fw-bold text-uppercase tracking-wide mb-0">Personal Info</h6>
                  <button
                    className={`btn btn-sm ${pi.piRevealed ? "btn-outline-danger" : "btn-outline-secondary"} border-0`}
                    onClick={pi.piRevealed ? pi.hide : pi.reveal}
                    disabled={!canEdit}
                  >
                    <i className={`bi ${pi.piRevealed ? "bi-eye-slash" : "bi-eye"} me-1`} />
                    {pi.piRevealed ? `Hide (${pi.piLeft}s)` : "Reveal All"}
                  </button>
                </div>

                {/* Set by EditContactInfoModal.jsx on the company portal
                    (see utils/partnerClientEdit.js) whenever a partner
                    updates email/phone/address themselves — same clients
                    row staff already read, so this is just a heads-up that
                    it changed and who changed it, not a separate copy to
                    reconcile. */}
                {client.partner_updated_at && (
                  <div className="small text-primary mb-2">
                    <i className="bi bi-person-check-fill me-1" />
                    Edited by partner{client.partner_updated_by_name ? ` (${client.partner_updated_by_name})` : ""} on {new Date(client.partner_updated_at).toLocaleString()}
                  </div>
                )}

                <ul className="list-group list-group-flush mb-3 rounded border shadow-sm flex-grow-1">
                  {[
                    ["SSN",          client.ssn,                  "***-**-****"],
                    ["Email",        client.email,                "***@***.***"],
                    ["Phone",        client.phone,                "(***) ***-****"],
                    ["Address",      client.address,              "(hidden)"],
                    ["DOB",          client.dob,                  "**/**/****"],
                    ["Logins/Notes", client.logins_notes || "—",  "(hidden)"],
                  ].map(([label, value, placeholder]) => {
                    // What the AI read directly off the ID/SSN card/proof-
                    // of-address document — see aiSublines above. Shown
                    // right under the value on file so a mismatch (colored
                    // red) is obvious without leaving this card. Respects
                    // the same reveal/hide toggle as the value itself so a
                    // full SSN never sits in plaintext when hidden.
                    const ai = aiSublines[label];
                    return (
                      <li key={label} className="list-group-item bg-light">
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">{label}:</span>
                          <MaskedValue value={value} revealed={pi.piRevealed} placeholder={placeholder} />
                        </div>
                        {ai && (
                          <div
                            className={`small text-end mt-1 ${ai.matched === false ? "text-danger fw-bold" : ai.matched === true ? "text-success" : "text-muted"}`}
                          >
                            <i className={`bi ${ai.matched === false ? "bi-exclamation-triangle-fill" : ai.matched === true ? "bi-patch-check-fill" : "bi-robot"} me-1`} />
                            AI detected from {ai.source}: {pi.piRevealed ? ai.value : "••••••••"}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {canEdit && (
                  <div className="row g-2 mt-auto">
                    <div className="col-12 col-xl d-grid">
                      <Button variant="primary" className="fw-bold shadow-sm w-100 h-100 d-flex align-items-center justify-content-center py-2" onClick={onEdit}>
                        <div><i className="bi bi-pencil-square me-2" />Edit Info</div>
                      </Button>
                    </div>

                    <div className="col-12 col-xl d-grid">
                      <Dropdown className="d-grid h-100">
                        <Dropdown.Toggle variant="dark" className="w-100 border-secondary shadow-sm h-100 d-flex align-items-center justify-content-center py-2">
                          <div><i className="bi bi-shield-lock me-2 text-warning" /> Status</div>
                        </Dropdown.Toggle>
                        <Dropdown.Menu className="shadow-lg border-secondary py-2">
                          {!client.is_paid && <Dropdown.Item onClick={actions.markAsPaid} className="text-success fw-bold py-2"><i className="bi bi-currency-dollar me-2" /> Mark as Paid</Dropdown.Item>}
                          {client.is_paid  && <Dropdown.Item onClick={actions.togglePause} className="text-warning py-2"><i className={`bi bi-${client.is_paused ? "play" : "pause"}-fill me-2`} />{client.is_paused ? "Resume Service" : "Pause Service"}</Dropdown.Item>}
                          <Dropdown.Divider className="border-secondary opacity-25" />
                          <Dropdown.Item onClick={actions.toggleDispute} className={`${client.dont_dispute ? "text-danger" : "text-info"} py-2`}>
                            <i className={`bi bi-${client.dont_dispute ? "slash-circle" : "check-circle"} me-2`} />
                            {client.dont_dispute ? "Allow Dispute" : "Do Not Dispute"}
                          </Dropdown.Item>
                          <Dropdown.Divider className="border-secondary opacity-25" />
                          <Dropdown.Item
                            onClick={client.inquiries_signature_url ? actions.toggleInquiriesLock : undefined}
                            className={`${client.inquiries_locked ? "text-success" : "text-danger"} py-2 fw-bold ${!client.inquiries_signature_url && !client.inquiries_locked ? "opacity-50" : ""}`}
                            disabled={!client.inquiries_signature_url && !client.inquiries_locked}
                          >
                            <i className={`bi ${client.inquiries_locked ? "bi-unlock-fill" : "bi-lock-fill"} me-2`} />
                            {client.inquiries_locked ? "Unlock Inquiries" : "Lock Inquiries"}
                          </Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
                    </div>

                    <div className="col-12 col-xl d-grid">
                      {(isBureauService || isDirectBureauService) ? (
                        <Dropdown className="d-grid h-100">
                          <Dropdown.Toggle variant="dark" className="w-100 border-secondary shadow-sm h-100 d-flex align-items-center justify-content-center py-2">
                            <div><i className="bi bi-building-check me-2 text-success" /> Bureaus</div>
                          </Dropdown.Toggle>
                          <Dropdown.Menu className="shadow-lg border-secondary py-2">
                            <Dropdown.Item onClick={() => onBureauComplete("All")} className="text-success fw-bold py-2">
                                <i className="bi bi-check2-all me-2" /> Mark All Complete
                            </Dropdown.Item>
                            <Dropdown.Divider className="border-secondary opacity-25" />

                            {[
                              ["Experian", "EXP"],
                              ["TransUnion", "TU"],
                              ["Equifax", "EQ"],
                            ].map(([bFull, label]) => (
                              <Dropdown.Item key={label} onClick={() => onBureauComplete(bFull)}>
                                  <i className="bi bi-check text-success me-2" /> {label} Complete
                              </Dropdown.Item>
                            ))}

                            <Dropdown.Divider className="border-secondary opacity-25" />
                            {[
                              ["Experian", "EXP"],
                              ["TransUnion", "TU"],
                              ["Equifax", "EQ"],
                            ].map(([bFull, label]) => (
                              <Dropdown.Item key={label} onClick={() => onBureauNA(bFull)} className="text-muted"><i className="bi bi-slash-circle me-2" /> {label} N/A</Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown>
                      ) : (
                        <Button
                          variant={client.date_completed ? "outline-success" : "success"}
                          className="w-100 border-secondary shadow-sm h-100 d-flex align-items-center justify-content-center py-2 fw-bold"
                          onClick={actions.markServiceComplete}
                          disabled={!!client.date_completed}
                        >
                          <i className="bi bi-check2-circle me-2" />
                          {client.date_completed ? "Completed" : "Mark Complete"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Company Info column ── */}
              <div className="col-md-6 d-flex flex-column">
                <h6 className="text-muted fw-bold text-uppercase tracking-wide mb-2 mt-3 mt-md-0">Company Info</h6>
                <ul className="list-group list-group-flush mb-3 rounded border shadow-sm flex-grow-1">
                  <li className="list-group-item d-flex justify-content-between bg-light"><span className="text-muted">Company:</span><span className="fw-bold">{client.company_name || "—"}</span></li>
                  <li className="list-group-item d-flex justify-content-between bg-light"><span className="text-muted">Agent:</span><span className="fw-bold">{agentDisplay}</span></li>
                  <li className="list-group-item d-flex justify-content-between bg-light"><span className="text-muted">Address:</span><MaskedValue value={client.address || "—"} revealed={pi.piRevealed} placeholder="********" /></li>
                  <li className="list-group-item d-flex justify-content-between bg-light">
                    <span className="text-muted">Admin:</span>
                    {readonly
                      ? <span className="fw-bold">{client.admin_name}</span>
                      : <Link to={`/admin/${encodeURIComponent(client.admin_id)}`} className="fw-bold text-decoration-none">{client.admin_name}</Link>}
                  </li>
                  <li className="list-group-item d-flex justify-content-between bg-light"><span className="text-muted">Counter:</span><span className="fw-bold">{client.counter || "—"}</span></li>
                  <li className="list-group-item d-flex justify-content-between bg-light"><span className="text-muted">Service:</span><span className="fw-bold">{serviceLabel(client, "—")}</span></li>
                </ul>

                <div className="row g-2 mt-auto">
                  <div className="col-12 col-xl d-grid">
                    <Dropdown className="d-grid h-100">
                      <Dropdown.Toggle variant="primary" className="w-100 shadow-sm fw-bold h-100 d-flex align-items-center justify-content-center py-2">
                        <div><i className="bi bi-cloud-arrow-down me-2" /> Reports</div>
                      </Dropdown.Toggle>
                      <Dropdown.Menu className="shadow-lg border-secondary py-2">
                        <Dropdown.Header className="text-primary fw-bold text-uppercase tracking-wide">Initial Import</Dropdown.Header>
                        <Dropdown.Item onClick={() => { setIsUpdateMode(false); setActiveModal("fetch3b"); }} className="py-2"><i className="bi bi-file-earmark-arrow-down me-2 text-muted" /> SmartCredit</Dropdown.Item>
                        <Dropdown.Item onClick={() => { setIsUpdateMode(false); setActiveModal("parseIq"); }}  className="py-2"><i className="bi bi-file-earmark-arrow-down me-2 text-muted" /> IdentityIQ</Dropdown.Item>
                        <Dropdown.Divider className="border-secondary opacity-25 my-2" />
                        <Dropdown.Header className="text-warning fw-bold text-uppercase tracking-wide">Update Existing</Dropdown.Header>
                        <Dropdown.Item onClick={() => { setIsUpdateMode(true); setActiveModal("fetch3b"); }} className="py-2"><i className="bi bi-arrow-repeat me-2 text-warning" /> Via SmartCredit</Dropdown.Item>
                        <Dropdown.Item onClick={() => { setIsUpdateMode(true); setActiveModal("parseIq"); }}  className="py-2"><i className="bi bi-arrow-repeat me-2 text-warning" /> Via IdentityIQ</Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
                  </div>

                  <div className="col-12 col-xl d-grid">
                    <Dropdown className="d-grid h-100">
                      <Dropdown.Toggle variant="dark" className="w-100 border-secondary shadow-sm h-100 d-flex align-items-center justify-content-center py-2">
                        <div><i className="bi bi-tools me-2 text-info" /> Tools</div>
                      </Dropdown.Toggle>
                      <Dropdown.Menu align="end" className="shadow-lg border-secondary py-2">
                        <Dropdown.Item onClick={() => openTab(`/clients/${clientId}/report`)} className="py-2"><i className="bi bi-filetype-pdf me-2 text-danger" /> Credit Analysis</Dropdown.Item>
                        <Dropdown.Item onClick={() => openTab(`/clients/${clientId}/funding`)} className="py-2"><i className="bi bi-filetype-pdf me-2 text-danger" /> Funding Blueprint</Dropdown.Item>
                        <Dropdown.Item onClick={() => openTab(`/clients/${clientId}/progress-report`)} className="py-2"><i className="bi bi-graph-up-arrow me-2 text-success" /> Progress Report</Dropdown.Item>
                        {hasPermission("edit_client") && <Dropdown.Item onClick={actions.updateStartDateToToday} className="py-2"><i className="bi bi-calendar-check me-2 text-primary" /> Set Start Date Today</Dropdown.Item>}
                        <Dropdown.Divider className="border-secondary opacity-25 my-2" />
                        <Dropdown.Item onClick={() => setActiveModal("ssnManager")} className="text-danger fw-bold py-2"><i className="bi bi-shield-lock me-2" /> SSN Manager</Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
                  </div>

                  <div className="col-12 col-xl d-grid force-stretch-btn">
                    <div className="d-grid h-100">
                      <RegenerateHistoryBtn clientId={clientId} onComplete={handleModalSave} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* AI document validity check — warning only, see comment on
                the docIssues fetch above. Moved below Personal Info/Company
                Info (was previously up in the card header, above the name)
                per explicit request to have it sit under the actual client
                information instead of above it. */}
            {docIssues.length > 0 && (
              <div className="d-flex align-items-center flex-wrap gap-2 mt-3">
                {docIssues.map((d) => (
                  <Badge
                    key={d.slot}
                    bg="warning"
                    text="dark"
                    className="shadow-sm"
                    title={d.validation_notes || "AI check flagged this document — see Cover Letter Assets / Alignment Check below"}
                  >
                    <i className="bi bi-file-earmark-excel-fill me-1"></i>
                    {DOC_LABELS[d.slot] || d.slot}: {DOC_STATUS_LABELS[d.validation_status] || d.validation_status}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {activeModal && modalComponents[activeModal]}

        {pendingBureauAction && (
          <ManagerOverrideModal
            show
            onClose={() => setPendingBureauAction(null)}
            clientId={clientId}
            clientName={client.full_name}
            holds={pendingBureauAction.holds}
            onOverridden={handleOverrideConfirmed}
          />
        )}
      </div>
    </>
  );
}