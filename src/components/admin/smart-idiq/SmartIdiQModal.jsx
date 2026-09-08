import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient";
import { useAuth } from "../../../context/AuthContext";
import { getEasternDateString } from "../../../utils/timezone";
import { Form } from "react-bootstrap";
import useLogger from "../../../hooks/useLogger";
import { computeAiCounts, withDefaultedApprovedCounts, isBlankStartInquiries, computeBureauProgress } from "../../../utils/inquiryCounts";
import { resolveRoundForNewClient, insertClientRecord } from "../../../utils/clientDuplicateRound";
import { classifyInquiries } from "../../../utils/classifyInquiries";
import { flagGuardedInquiries } from "../../../utils/aiReviewQueue";
import { useToast } from "../../shared/ui/ToastNotifier";

export default function SmartIdiQModal({ show, onClose }) {
  const { addToast } = useToast();
  const { adminName, userId } = useAuth();
  const [smartCreds, setSmartCreds] = useState({ email: "", password: "" });
  const [idiqCreds, setIdiqCreds] = useState({ email: "", password: "" });
  const [loadingSmart, setLoadingSmart] = useState(false);
  const [loadingIDIQ, setLoadingIDIQ] = useState(false);
  const [resultIDIQ, setResultIDIQ] = useState(null);
  const [fullName, setFullName] = useState("");
  // The client's own contact email — separate from smartCreds.email/
  // idiqCreds.email above, which are login credentials for the bureau
  // monitoring service and aren't reliably the client's real email.
  const [clientEmail, setClientEmail] = useState("");
  const [clientId, setClientId] = useState(null);

  const logAction = useLogger();

  useEffect(() => {
    if (show) {
      setFullName("");
      setClientEmail("");
      setClientId(null);
      setSmartCreds({ email: "", password: "" });
      setIdiqCreds({ email: "", password: "" });
      setResultIDIQ(null);
    }
  }, [show]);

  const insertClient = async () => {
    if (!fullName.trim()) {
      addToast({ title: "Missing Name", message: "Full name is required.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return null;
    }
    if (!clientEmail.trim()) {
      addToast({ title: "Missing Email", message: "Client email is required.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return null;
    }

    // Warn-and-confirm on a returning email instead of silently creating a
    // duplicate — see utils/clientDuplicateRound.js.
    const disputeRound = await resolveRoundForNewClient(clientEmail);
    if (disputeRound === null) return null;

    const { data, error } = await insertClientRecord({
        full_name: fullName.toUpperCase(),
        email: clientEmail.trim(),
        // Matches AddClientSidebar.jsx's defaults — without these, a client
        // created via this quick-add path shows up blank everywhere else
        // (AdminClientList's paid badge/dispute method/counts row, ops
        // dashboard flags, etc.) until someone manually edits it.
        dispute_method: "inquiry deletion",
        is_paid: false,
        dispute_round: disputeRound,
      }, { select: "id" });

    if (error) {
      addToast({ title: "Creation Failed", message: "Failed to create client: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return null;
    }

    return data.id;
  };

  // --- UPDATED HELPER: Now accepts 'provider' and logs to AI Training ---
  const commonUpdateAndUpload = async (classified, clientId, provider) => {
    
    // 1. Upload JSON to Storage
    const blob = new Blob([JSON.stringify(classified, null, 2)], {
      type: "application/json",
    });
    const filePath = `${clientId}/thread.json`;

    const { error } = await supabase.storage
      .from("clients")
      .upload(filePath, blob, {
        upsert: true,
        contentType: "application/json",
      });

    if (error) {
      throw new Error(`Classified but failed to save: ${error.message}`);
    }

    // 1b. AI Review Queue — flags any inquiry the classifier's own
    // deterministic guard downgraded (see utils/aiReviewQueue.js). Best
    // effort, never blocks the save this runs after.
    flagGuardedInquiries(supabase, clientId, classified);

    // 2. [NEW] Log to 'ai_training_logs'
    // We assume 'classified' contains the counts or the full object acts as the count source
    try {
        const { error: aiLogError } = await supabase.from("ai_training_logs").insert({
            provider: provider, // 'SmartCredit' or 'IdentityIQ'
            raw_text_snippet: JSON.stringify(classified).substring(0, 5000), // Store result snippet
            detected_counts: classified, // Store the full classification object
            created_at: new Date().toISOString()
            // user_id: userId // Optional: Add if you want to track WHO ran it
        });

        if (aiLogError) {
            console.error("⚠️ Failed to log to AI Training:", aiLogError.message);
        }
    } catch (logErr) {
        console.error("AI Log Exception:", logErr);
    }

    // 3. Phase 0: persisted bureau counts (see utils/inquiryCounts.js — same
    // helper used by useInquiriesThread.js and UploadReportForm.jsx so all
    // three upload paths compute "AI count" identically). approved_*_count
    // is only defaulted here if a supervisor hasn't already set it.
    const { data: currentClient } = await supabase
      .from("clients")
      .select("approved_exp_count, approved_tu_count, approved_eq_count, start_inquiries")
      .eq("id", clientId)
      .single();
    const aiCounts = computeAiCounts(classified);
    const approvedCounts = withDefaultedApprovedCounts(aiCounts, currentClient);
    // Only set once — never overwrites a value a later thread-edit save may
    // have already set (matches useInquiriesThread.js's saveUpdatedThread
    // logic). Without this, AdminClientList.jsx shows a blank "start
    // inquiries" for any client counted purely through this quick-add flow.
    const finalStartInq = (currentClient?.start_inquiries && !isBlankStartInquiries(currentClient.start_inquiries))
      ? currentClient.start_inquiries
      : `(TU ${aiCounts.ai_tu_count}, EXP ${aiCounts.ai_exp_count}, EQ ${aiCounts.ai_eq_count})`;
    // NOTE: counted_at is intentionally NOT set here. This modal auto-saves
    // the AI's classification the instant it comes back from the
    // classify-inquiries endpoint — there's no human review step in this
    // flow (that only happens later, if/when someone opens the client's
    // full thread editor). counted_at should reflect that real review save
    // via useInquiriesThread.js's saveUpdatedThread, not this initial fetch.

    // This modal runs a real AI classifier (classify-inquiries) before
    // getting here, so — unlike a plain intake import — `classified` can
    // already contain deleted/linked/dnd items, not just "non-linked".
    // Hardcoding exp_completed/tu_completed/eq_completed to false and never
    // touching exp_na/tu_na/eq_na at all (as this used to) meant a bureau
    // the AI correctly classified as all Do-Not-Dispute would still show
    // as "incomplete", and any na flag left over from a PRIOR round on
    // this client would go stale instead of being recomputed here. Using
    // the same shared function every other save path uses fixes both.
    const newProgress = computeBureauProgress(classified);

    // 4. Update Client Record
    const { error: updateError } = await supabase
      .from("clients")
      .update({
        counter: adminName,
        start_inquiries: finalStartInq,
        exp_completed: newProgress.exp_completed,
        tu_completed: newProgress.tu_completed,
        eq_completed: newProgress.eq_completed,
        exp_na: newProgress.exp_na,
        tu_na: newProgress.tu_na,
        eq_na: newProgress.eq_na,
        progress: newProgress.progress,
        public_token: null,
        public_token_expires_at: null,
        public_token_viewed: false,
        ...aiCounts,
        ...approvedCounts,
      })
      .eq("id", clientId);

    if (updateError) {
      addToast({ title: "Partial Save", message: `File saved but failed to reset progress: ${updateError.message}`, variant: "warning", icon: "bi-exclamation-triangle-fill", timeout: 8000 });
    } else {
      addToast({ title: "Saved", message: "thread.json saved & Inquiries Counted.", variant: "success", icon: "bi-check-circle-fill" });
      setTimeout(() => window.location.reload(), 900);
    }

    // 5. Log Call Metrics
    const updates = {
      total_calls: 0,
      total_docs: 0,
      total_disputes: 0,
      total_confirmed: 0,
      total_unable_to_dispute: 0,
      total_disconnected: 0,
      total_count: 1,
    };

    if (userId) {
      const { error: metricError } = await supabase.rpc(
        "increment_call_metrics",
        {
          uid: userId,
          ldate: getEasternDateString(),
          ...updates,
        }
      );
      if (metricError) console.error("Metrics update failed:", metricError.message);
    }
  };

  const handleFetchSmart = async () => {
    const id = clientId || (await insertClient());
    if (!id) return;

    setClientId(id);
    setLoadingSmart(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch_3b_report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(smartCreds),
        }
      );

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "3B fetch failed");

      // Shared with Fetch3bModal.jsx/ParseRreportModal.jsx — pulls in the
      // lender alias table (sql/add_lender_aliases.sql) so name matching
      // is consistent everywhere instead of each call site re-fetching
      // classify-inquiries on its own.
      const classified = await classifyInquiries({
        accounts: data.accounts,
        experian: data.experian,
        transunion: data.transunion,
        equifax: data.equifax,
      });
      if (!classified.success) throw new Error("Classification failed");

      // Pass "SmartCredit" as the provider
      await commonUpdateAndUpload(classified, id, "SmartCredit");

      await logAction({
        action: "fetch_smartcredit",
        targetId: id,
        targetName: fullName.toUpperCase(),
        details: "Imported and classified client via SmartCredit."
      });

    } catch (err) {
      addToast({ title: "SmartCredit Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
    setLoadingSmart(false);
  };

  const handleFetchIDIQ = async () => {
    const id = clientId || (await insertClient());
    if (!id) return;

    setClientId(id);
    setLoadingIDIQ(true);
    setResultIDIQ(null);

    try {
      const res = await fetch("https://idiq-api.onrender.com/loginidiq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(idiqCreds),
      });

      const parsed = await res.json();
      if (!parsed.success) throw new Error(parsed.error || "Parsing failed");

      // Shared with Fetch3bModal.jsx/ParseRreportModal.jsx — see the
      // SmartCredit branch above for why this replaced a raw fetch call.
      const classified = await classifyInquiries({
        accounts: parsed.accounts,
        experian: parsed.experian,
        transunion: parsed.transunion,
        equifax: parsed.equifax,
      });
      if (!classified.success) throw new Error("Classification failed");

      // Pass "IdentityIQ" as the provider
      await commonUpdateAndUpload(classified, id, "IdentityIQ");

      await logAction({
        action: "fetch_idiq",
        targetId: id,
        targetName: fullName.toUpperCase(),
        details: "Imported and classified client via IdentityIQ."
      });

    } catch (err) {
      setResultIDIQ({
        error: "❌ Failed to fetch and classify from IDIQ",
        detail: err.message,
      });
    }

    setLoadingIDIQ(false);
  };

  if (!show) return null;

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-xl modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">🧠 SmartCredit & 🆔 IDIQ Login</h5>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <div className="row">
              <Form.Group className="mb-4">
                <Form.Label>Client Full Name</Form.Label>
                <input
                  type="text"
                  className="form-control"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter client full name"
                />
              </Form.Group>

              <Form.Group className="mb-4">
                <Form.Label>Client Email</Form.Label>
                <input
                  type="email"
                  className="form-control"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@email.com"
                  required
                />
              </Form.Group>

              {/* Smart Credit */}
              <div className="col-md-6 border-end">
                <h6 className="text-primary mb-3">Smart Credit</h6>
                <label>Email</label>
                <input
                  className="form-control mb-2"
                  type="email"
                  value={smartCreds.email}
                  onChange={(e) => setSmartCreds(prev => ({ ...prev, email: e.target.value.replace(/\s+/g, "") }))}
                />
                <label>Password</label>
                <input
                  className="form-control mb-3"
                  type="password"
                  value={smartCreds.password}
                  onChange={(e) => setSmartCreds(prev => ({ ...prev, password: e.target.value.replace(/\s+/g, "") }))}
                />
                <button
                  className="btn btn-primary w-100"
                  onClick={handleFetchSmart}
                  disabled={loadingSmart}
                >
                  {loadingSmart ? "Processing..." : "Fetch & Classify (SmartCredit)"}
                </button>
              </div>

              {/* IDIQ */}
              <div className="col-md-6">
                <h6 className="text-success mb-3">IDIQ</h6>
                <label>Email</label>
                <input
                  className="form-control mb-2"
                  type="email"
                  value={idiqCreds.email}
                  onChange={(e) => setIdiqCreds(prev => ({ ...prev, email: e.target.value }))}
                />
                <label>Password</label>
                <input
                  className="form-control mb-3"
                  type="password"
                  value={idiqCreds.password}
                  onChange={(e) => setIdiqCreds(prev => ({ ...prev, password: e.target.value }))}
                />
                <button
                  className="btn btn-success w-100"
                  onClick={handleFetchIDIQ}
                  disabled={loadingIDIQ}
                >
                  {loadingIDIQ ? "Processing..." : "Fetch & Classify (IDIQ)"}
                </button>

                {resultIDIQ && (
                  <pre className="mt-3 bg-light p-2 rounded" style={{ maxHeight: 200, overflow: "auto" }}>
                    {JSON.stringify(resultIDIQ, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}