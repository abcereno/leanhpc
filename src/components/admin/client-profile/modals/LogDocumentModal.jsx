import { useState } from "react";
import { Modal, Button, Form } from "react-bootstrap";
import { supabase } from "../../../../supabaseClient";
import { useAuth } from "../../../../context/AuthContext";
import { getEasternDateString } from "../../../../utils/timezone";
import { useToast } from "../../../shared/ui/ToastNotifier";

// 🔒 Hard-code your webhook here:
const HL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/rqr5oOzXxiHjh8wSS7T2/webhook-trigger/74390dd8-3c06-4cd3-9ff3-1f2295f902f8";

// `initialBureaus` (e.g. { EXP: true }) pre-checks whichever bureau this
// modal was opened for — used by DocumentRouting.jsx, which opens this
// modal from a specific bureau's "submitted" checkbox rather than a
// generic "Log Document" button, so that checkbox's bureau should already
// be checked when the modal appears instead of making the admin re-select
// it. Bureaus stay freely editable either way (an admin submitting one
// bureau's docs may well have also submitted another's in the same
// mailing).
//
// `onLogged(selectedBureaus)` fires right after the document_logs insert
// succeeds (before the webhook/metrics work below, which are fire-and-
// forget) — lets a caller like DocumentRouting.jsx react to a successful
// log (e.g. flip its own `{bureau}_submitted` checkbox in document_routing)
// without this modal needing to know that table exists. Kept optional so
// existing callers (ClientHeader.jsx, RemindersSidebar.jsx) are unaffected.
export default function LogDocumentModal({ show, onClose, clientId, initialBureaus = null, onLogged = null }) {
  const { addToast } = useToast();
  const { userId } = useAuth();
  const [note, setNote] = useState("");
  const [bureaus, setBureaus] = useState(() => ({
    EXP: !!initialBureaus?.EXP,
    TU: !!initialBureaus?.TU,
    EQ: !!initialBureaus?.EQ,
  }));
  const [submitting, setSubmitting] = useState(false);

  const toggleBureau = (key) =>
    setBureaus((prev) => ({ ...prev, [key]: !prev[key] }));

  // ---- Robust sender: fetch → sendBeacon → image GET fallback
  const sendToHighLevel = async (payload) => {
    if (!HL_WEBHOOK_URL) {
      console.warn("HL webhook URL missing.");
      return false;
    }

    // Try normal fetch (JSON)
    try {
      console.log("[HL] sending via fetch →", HL_WEBHOOK_URL, payload);
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const res = await fetch(HL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
        signal: controller.signal,
      });
      clearTimeout(id);

      if (res.ok) {
        console.log("[HL] fetch OK", res.status);
        return true;
      } else {
        const text = await res.text().catch(() => "");
        console.error("[HL] fetch failed", res.status, text);
      }
    } catch (err) {
      console.error("[HL] fetch error", err?.message || err);
    }

    // Try sendBeacon (no CORS preflight; text/plain)
    try {
      const beaconData = new Blob([JSON.stringify(payload)], {
        type: "text/plain",
      });
      const ok = navigator.sendBeacon?.(HL_WEBHOOK_URL, beaconData);
      console.log("[HL] sendBeacon attempted →", ok);
      if (ok) return true;
    } catch (err) {
      console.error("[HL] sendBeacon error", err?.message || err);
    }

    // Final fallback: 1px GET with querystring (some relays accept GET)
    try {
      const qs = encodeURIComponent(JSON.stringify(payload));
      const img = new Image();
      img.src = `${HL_WEBHOOK_URL}?payload=${qs}`;
      console.log("[HL] image GET fallback fired");
      return true; // fire-and-forget
    } catch (err) {
      console.error("[HL] image fallback error", err?.message || err);
    }

    return false;
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    // Callback +3 days (YYYY-MM-DD)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    const callbackDateISO = threeDaysFromNow.toISOString().split("T")[0];

    // Build bureau array for Supabase (text[])
    const selectedBureaus = Object.entries(bureaus)
      .filter(([, v]) => !!v)
      .map(([k]) => k.toUpperCase().trim());

    // Safety: trim/minify note
    const cleanNote = (note || "").trim();

    // Load client details
    let client = { full_name: null, email: null, phone: null };
    try {
      const { data, error: clientErr } = await supabase
        .from("clients")
        .select("full_name,email,phone")
        .eq("id", clientId)
        .single();
      if (clientErr) console.error("Fetch client failed:", clientErr.message);
      if (data) client = data;
    } catch (e) {
      console.error("Fetch client exception:", e?.message || e);
    }

    // Insert doc log (✅ ensure submitted_at and bureau are written)
    const { error } = await supabase.from("document_logs").insert({
      client_id: clientId,
      admin_id: userId,
      callback_date: callbackDateISO,
      note: cleanNote,
      bureau: selectedBureaus.length ? selectedBureaus : null, // text[]
      submitted_at: new Date().toISOString(),                  // ✅ ensure present
    });

    if (error) {
      setSubmitting(false);
      addToast({ title: "Log Failed", message: "Failed to log document: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    // Sync Docs Routing's own EXP/TU/EQ "submitted" checkbox for whichever
    // bureaus were logged here. DocumentRouting.jsx's checkbox click
    // already does this itself via its `onLogged` callback below (it opens
    // this modal, then flips its OWN task's checkbox on success) — but
    // this modal is also opened from the client profile page/Reminders
    // Sidebar (ClientHeader.jsx, RemindersSidebar.jsx), and neither of
    // those pass `onLogged` or know which document_routing row to update.
    // A doc logged from either of those left a real document_logs row
    // (which is what Docs Routing's "Last Docs Submitted" badge reads) but
    // never touched the checkbox — so staff would see a badge proving docs
    // went out, sitting right next to a checkbox that still says they
    // didn't. Doing the sync here, not just in DocumentRouting.jsx, fixes
    // it regardless of which screen the log was made from. Targets
    // whichever document_routing row is this client's current PENDING
    // round (same tie-break as sql/self_healing_workflow_queues.sql: the
    // highest round_count, most-recently-created if that's ambiguous) —
    // a no-op if there isn't one (e.g. already fully done), same
    // warning-only precedent as everything else in this modal.
    if (selectedBureaus.length > 0) {
      try {
        const { data: latestRound } = await supabase
          .from("document_routing")
          .select("id")
          .eq("client_id", clientId)
          .eq("status", "PENDING")
          .order("round_count", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestRound?.id) {
          const routingUpdates = {};
          selectedBureaus.forEach((b) => {
            routingUpdates[`${b.toLowerCase()}_submitted`] = true;
          });
          const { error: routingErr } = await supabase
            .from("document_routing")
            .update(routingUpdates)
            .eq("id", latestRound.id);
          if (routingErr) console.error("Failed to sync document_routing submitted checkbox:", routingErr.message);
        }
      } catch (e) {
        console.error("document_routing checkbox sync exception:", e?.message || e);
      }
    }

    // ✅ Clear the reminder now (Option B: RPC). Null = clear all, else partial clear.
    try {
      const { error: clearErr } = await supabase.rpc("clear_docs_reminder", {
        p_client_id: clientId,
        p_bureaus: selectedBureaus.length ? selectedBureaus : null,
      });
      if (clearErr) console.error("clear_docs_reminder failed:", clearErr.message);
    } catch (e) {
      console.error("clear_docs_reminder exception:", e?.message || e);
    }

    // The log itself is saved at this point — let the caller react (e.g.
    // DocumentRouting.jsx flipping its own checkbox) before the
    // fire-and-forget webhook/metrics work below, which shouldn't block it.
    if (onLogged) {
      try {
        onLogged(selectedBureaus);
      } catch (e) {
        console.error("onLogged callback error:", e?.message || e);
      }
    }

    // Prepare webhook payload (object booleans are fine for HL)
    const bureausObj = {
      EXP: !!bureaus.EXP,
      TU: !!bureaus.TU,
      EQ: !!bureaus.EQ,
    };

    const payload = {
      event: "document_logged",
      client_id: clientId,
      client: {
        full_name: client.full_name,
        email: client.email,
        phone: client.phone,
      },
      admin_id: userId || null,
      note: cleanNote,
      callback_date: callbackDateISO,
      bureaus: bureausObj, // object with boolean keys
      created_at_est: getEasternDateString(),
    };

    // Send webhook (fire-and-log)
    const sent = await sendToHighLevel(payload);
    if (!sent) console.warn("[HL] webhook may not have been delivered.");

    // Metrics (unchanged)
    const updates = {
      total_calls: 0,
      total_docs: 1,
      total_disputes: 0,
      total_confirmed: 0,
      total_unable_to_dispute: 0,
      total_disconnected: 0,
      total_count: 0,
    };
    if (userId) {
      const { error: metricError } = await supabase.rpc(
        "increment_call_metrics",
        { uid: userId, ldate: getEasternDateString(), ...updates }
      );
      if (metricError) console.error("Metrics update failed:", metricError.message);
    }

    setSubmitting(false);
    addToast({ title: "Logged", message: "Document submission logged.", variant: "success", icon: "bi-check-circle-fill" });
    onClose();
    setNote("");
    setBureaus({ EXP: false, TU: false, EQ: false });
  };

  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>📄 Log Document Submission</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Bureaus (select all that apply)</Form.Label>
          <div className="d-flex gap-4">
            <Form.Check
              type="checkbox"
              id="bureau-exp"
              label="Experian (EXP)"
              checked={bureaus.EXP}
              onChange={() => toggleBureau("EXP")}
            />
            <Form.Check
              type="checkbox"
              id="bureau-tu"
              label="TransUnion (TU)"
              checked={bureaus.TU}
              onChange={() => toggleBureau("TU")}
            />
            <Form.Check
              type="checkbox"
              id="bureau-eq"
              label="Equifax (EQ)"
              checked={bureaus.EQ}
              onChange={() => toggleBureau("EQ")}
            />
          </div>
          <Form.Text muted>
            Tip: selecting at least one keeps your follow-ups precise.
          </Form.Text>
        </Form.Group>

        <Form.Group>
          <Form.Label>Notes (optional)</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            placeholder="Details about what was submitted or needed"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={submitting /* || selectedBureaus.length === 0 */}
        >
          {submitting ? "Saving..." : "Log Document"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
