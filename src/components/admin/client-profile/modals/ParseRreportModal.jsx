import { useState, useRef, useEffect } from "react";
import { Modal, Button, Form } from "react-bootstrap";
import { supabase } from "../../../../supabaseClient";
import { useAuth } from "../../../../context/AuthContext";
import { getEasternDateString } from "../../../../utils/timezone";
import { runAuditEngine } from "../../../../utils/auditEngine";
import useLogger from "../../../../hooks/useLogger";
import { useToast } from "../../../shared/ui/ToastNotifier";
import { computeBureauProgress } from "../../../../utils/inquiryCounts";
import { classifyInquiries } from "../../../../utils/classifyInquiries";

const BUCKET = "clients";

async function fetchWithTimeout(url, options, timeoutMs = 180000, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      const isLast = attempt === retries;
      const isAbort = e?.name === "AbortError";

      if (isLast || !isAbort) {
        if (isAbort) throw new Error(`Request timed out after ${timeoutMs}ms`);
        throw e;
      }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  throw new Error("Network failed after retries");
}

/* --------------------------- Component ---------------------------- */

export default function ParseReportModal({ show, onClose, clientId, isUpdateMode = false, onCustomSave, onSaved }) {
  const { addToast } = useToast();
  const { userId, adminName } = useAuth(); 
  const logAction = useLogger();

  const [idiqEmail, setIdiqEmail] = useState("");
  const [idiqPassword, setIdiqPassword] = useState("");
  const [idiqPin, setIdiqPin] = useState("");
  const [idiqSsn, setIdiqSsn] = useState("");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [clientName, setClientName] = useState("Client"); 
  
  // 👇 Password Toggle State
  const [showPassword, setShowPassword] = useState(false);
  
  // [SECURITY STATE]
  const [reportExists, setReportExists] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const mounted = useRef(true);

  // Check storage on mount & Fetch Client Name
  useEffect(() => {
    mounted.current = true;
    const init = async () => {
        if (!clientId) return;
        try {
            // 1. Fetch Name
            const { data } = await supabase.from("clients").select("full_name").eq("id", clientId).single();
            if (data?.full_name && mounted.current) setClientName(data.full_name);

            // 2. Check Exists (Only if Initial Import)
            if (!isUpdateMode) {
                const { data: files } = await supabase.storage
                    .from(BUCKET)
                    .list(clientId, { search: 'thread.json' });
                
                if (mounted.current && files && files.length > 0) {
                    setReportExists(true);
                }
            }
        } catch (err) {
            console.error("Status check failed:", err);
        } finally {
            if (mounted.current) setCheckingStatus(false);
        }
    };
    init();
    return () => { mounted.current = false; };
  }, [clientId, isUpdateMode]);

  const setSafeResult = (val) => mounted.current && setResult(val);
  const setSafeLoading = (val) => mounted.current && setLoading(val);

  // --- HELPER: GENERATE SIMPLE IDs ---
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleSubmit = async () => {
    // [SECURITY] Pre-flight Check
    if (!isUpdateMode && reportExists) {
        addToast({ title: "Security Block", message: "Report already exists. Use 'Update' instead.", variant: "danger", icon: "bi-shield-exclamation" });
        return;
    }

    if (!idiqEmail || !idiqPassword) {
      setSafeResult({
        error: "🔒 Missing credentials",
        detail: "Please enter the IDIQ email and password.",
      });
      return;
    }

    setSafeLoading(true);
    setSafeResult(null);

    try {
      // 1. CALL NODE JS SERVICE
      const SERVICE_URL = "https://backend-4uir.onrender.com/loginidiq"; 

      const res = await fetchWithTimeout(
        SERVICE_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: idiqEmail,
            password: idiqPassword,
            pin: idiqPin,
            ssn: idiqSsn,
          }),
        }
      );

      const contentType = res.headers.get("content-type");
      let json;

      if (contentType && contentType.includes("application/json")) {
        json = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 100)}...`);
      }

      if (!res.ok || !json.success) {
        throw new Error(json.error || `IDIQ Fetch Failed: ${res.status}`);
      }

      const reportData = json.report;
      if (!reportData) throw new Error("No report data returned from IDIQ service.");

      // 2. ANALYZE REPORT (Audit Engine)
      let auditSummary = null;
      try {
          auditSummary = runAuditEngine(reportData);
          auditSummary.meta.source = "IdentityIQ";
      } catch (err) {
          console.error("Audit Engine Error:", err);
          throw new Error("Failed to analyze report data.");
      }

      // --- [UPDATE MODE BRANCH] ---
      if (isUpdateMode && onCustomSave) {
          await onCustomSave(reportData, auditSummary);
          
          try {
            await logAction({
                action: "update_idiq",
                targetId: clientId,
                targetName: clientName,
                details: "Updated report via IdentityIQ."
            });
          } catch(e) {
             console.warn("Skipping analytics log for update mode.");
          }
          onClose();
          return;
      }

      // ------------------------------------------------------------------
      // 3) STANDARD INITIAL SETUP
      // ------------------------------------------------------------------

      // A. Save Raw Report
      const blobRaw = new Blob([JSON.stringify(reportData, null, 2)], { type: "application/json" });
      const rawPath = `${clientId}/raw_credit_report.json`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(rawPath, blobRaw, { upsert: true, contentType: "application/json" });

      if (uploadError) throw new Error(`Storage Upload Failed: ${uploadError.message}`);

      // B. Save Daily Snapshot
      try {
          const dateStr = new Date().toISOString().split('T')[0];
          const summaryPath = `${clientId}/${dateStr}_summary_report.json`;
          const blobSummary = new Blob([JSON.stringify(auditSummary, null, 2)], { type: "application/json" });
          await supabase.storage.from(BUCKET).upload(summaryPath, blobSummary, { upsert: true });
      } catch (summErr) {
          console.warn("Snapshot failed (non-critical):", summErr);
      }

      // C. Save Active Audit Report
      const auditPath = `${clientId}/client_audit_report.json`;
      await supabase.storage.from(BUCKET).upload(auditPath, JSON.stringify(auditSummary), { upsert: true });

      // D. GENERATE & SAVE THREAD.JSON (WITH IDs!)
      // `newProgress` is computed here (from the same shared function every
      // other save path uses — utils/inquiryCounts.js#computeBureauProgress)
      // and used down in step E, instead of E always hardcoding progress 0
      // and every completion/na flag to false regardless of what was just
      // classified. Falls back to null (E's original hardcoded reset) only
      // if thread generation itself failed, since there's no classified
      // data to compute anything from in that case.
      let newProgress = null;
      try {
        const inquiries = auditSummary.inquiries || [];
        const accounts = auditSummary.accounts || [];

        const hasBureau = (item, bCode) => Array.isArray(item.bureaus) && item.bureaus.includes(bCode);
        const rawExperian = inquiries.filter(i => hasBureau(i, 'EX'));
        const rawTransunion = inquiries.filter(i => hasBureau(i, 'TU'));
        const rawEquifax = inquiries.filter(i => hasBureau(i, 'EQ'));

        // Admin-side initial import, so run this through the same AI
        // classifier SmartIdiQModal.jsx's quick-add flow already uses —
        // lands pre-classified instead of forcing a full manual pass in
        // the thread editor. See utils/classifyInquiries.js for the
        // never-throws fallback behavior.
        const classified = await classifyInquiries({
          accounts,
          experian: rawExperian,
          transunion: rawTransunion,
          equifax: rawEquifax,
        });

        const addId = (item) => ({
            ...item,
            id: item.id || generateId(),
            classification: item.classification || 'non-linked'
        });

        const accountsWithIds = accounts.map(addId);

        const threadPayload = {
            id: clientId,
            created_at: new Date().toISOString(),
            status: "active",
            round: 1,
            accounts: accountsWithIds,
            experian: (classified.experian || []).map(addId),
            transunion: (classified.transunion || []).map(addId),
            equifax: (classified.equifax || []).map(addId)
        };

        const threadPath = `${clientId}/thread.json`;
        await supabase.storage.from(BUCKET).upload(threadPath, JSON.stringify(threadPayload), { upsert: true });

        newProgress = computeBureauProgress(threadPayload);
      } catch (threadErr) {
        console.warn("⚠️ Failed to generate thread.json:", threadErr);
      }

      // E. RESET CLIENT PROGRESS
      const { error: updateError } = await supabase
        .from("clients")
        .update({
          counter: adminName || "System",
          progress: newProgress?.progress ?? 0.0,
          status: 'active',
          exp_completed: newProgress?.exp_completed ?? false,
          tu_completed: newProgress?.tu_completed ?? false,
          eq_completed: newProgress?.eq_completed ?? false,
          exp_na: newProgress?.exp_na ?? false,
          tu_na: newProgress?.tu_na ?? false,
          eq_na: newProgress?.eq_na ?? false,
          public_token: null, public_token_expires_at: null, public_token_viewed: false,
        })
        .eq("id", clientId);

      if (updateError) console.warn("Failed to reset client status:", updateError);

      try {
        if (userId) {
          await supabase.rpc("increment_call_metrics", {
            uid: userId,
            ldate: getEasternDateString(),
            total_count: 1, 
            total_calls: 0, total_docs: 0, total_disputes: 0, total_confirmed: 0, total_unable_to_dispute: 0, total_disconnected: 0
          });
        }

        await logAction({
           action: "fetch_idiq",
           targetId: clientId,
           targetName: clientName,
           details: "Imported and initialized client via IdentityIQ."
        });
      } catch (err) {
         console.warn("Skipping metrics log for partner:", err);
      }

      setSafeResult({ ok: "✅ Report fetched & initialized successfully!" });
      
      if (onSaved) {
          onSaved();
      } else {
          onClose();
      }

    } catch (err) {
      console.error("IDIQ Process Error:", err);
      const errMsg = err.message || String(err);
      
      // 👇 [FIX] Check message content for automated redirection markers
      const isRedirectIssue = 
        errMsg.includes("Dashboard.aspx") || 
        errMsg.includes("redirected") || 
        errMsg.includes("refresh") || 
        errMsg.includes("terms");

      setSafeResult({
        error: isRedirectIssue ? "⚠️ Action Required on IdentityIQ" : "❌ Failed to fetch/save report",
        detail: errMsg,
        isRedirect: isRedirectIssue
      });
    } finally {
      setSafeLoading(false);
    }
  };

  const isLocked = !isUpdateMode && reportExists;
  const showLoading = !isUpdateMode && checkingStatus;

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
            {isUpdateMode ? "Log in to IDIQ (Update Mode)" : "Log in to IDIQ & Fetch Report"}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {isLocked && (
            <div className="alert alert-danger">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                <strong>Report Already Exists</strong>
                <p className="mb-0 small mt-1">
                    An initial report has already been imported. Re-importing is disabled to prevent data loss. 
                </p>
            </div>
        )}

        {showLoading && (
            <div className="text-center py-3">
                <div className="spinner-border text-primary spinner-border-sm me-2"></div>
                <span className="small text-muted">Checking client status...</span>
            </div>
        )}

        {!isLocked && !showLoading && (
            <>
                <p className="small text-muted">
                    {isUpdateMode 
                        ? "Fetches latest data from IdentityIQ to update charts. DOES NOT reset disputes."
                        : "Fetches report from IdentityIQ, runs audit, and initializes client for disputes."}
                </p>
                
                <div className="small text-muted mb-3">
                    Please provide <strong className="text-danger">IdentityIQ</strong> logins.
                    <br />
                    <span className="d-inline-block mt-1">
                        Need an account? 
                        <a href="https://member.identityiq.com/sc-securepreferred.aspx?offercode=431259UT" target="_blank" rel="noreferrer" className="ms-1 text-decoration-none fw-bold text-danger">Register IdentityIQ</a>
                    </span>
                </div>

                <Form.Group className="mb-3">
                <Form.Label>Email / Username</Form.Label>
                <Form.Control
                    type="email"
                    value={idiqEmail}
                    onChange={(e) => setIdiqEmail(e.target.value.replace(/\s+/g, ""))}
                    placeholder="Enter IDIQ email"
                    autoComplete="username"
                    disabled={loading || isLocked}
                />
                </Form.Group>

                <Form.Group className="mb-3">
                <Form.Label>Password</Form.Label>
                <div className="input-group">
                    <Form.Control
                        type={showPassword ? "text" : "password"}
                        value={idiqPassword}
                        onChange={(e) => setIdiqPassword(e.target.value.replace(/\s+/g, ""))}
                        placeholder="Enter IDIQ password"
                        autoComplete="current-password"
                        disabled={loading || isLocked}
                        className="border-end-0"
                    />
                    <Button 
                        variant="light" 
                        className="border border-start-0 text-muted px-3" 
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading || isLocked}
                    >
                        <i className={`bi bi-eye${showPassword ? '-slash-fill text-primary' : '-fill'}`}></i>
                    </Button>
                </div>
                </Form.Group>

                <Form.Group className="mb-3">
                <Form.Label>PIN (if required)</Form.Label>
                <Form.Control
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={idiqPin}
                    onChange={(e) => setIdiqPin(e.target.value)}
                    placeholder="Enter 4-digit PIN"
                    autoComplete="one-time-code"
                    disabled={loading || isLocked}
                />
                </Form.Group>

                <Form.Group className="mb-3">
                <Form.Label>Last 4 of SSN (if required)</Form.Label>
                <Form.Control
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={idiqSsn}
                    onChange={(e) => setIdiqSsn(e.target.value)}
                    placeholder="Enter last 4 digits of SSN"
                    autoComplete="off"
                    disabled={loading || isLocked}
                />
                </Form.Group>
            </>
        )}

        {result && (
          <div className={`alert ${result.error ? 'alert-danger' : 'alert-success'} mt-3`}>
              <strong>{result.error || result.ok}</strong>
              {result.detail && <div className="small mt-1">{result.detail}</div>}
              
              {/* 👇 [FIX] Contextual recovery steps render dynamically upon redirection detection */}
              {result.isRedirect && (
                <div className="mt-3 pt-2 border-top border-danger-subtle small text-dark">
                  <span className="fw-bold d-block mb-1 text-danger">💡 Verification Required:</span>
                  <ol className="ps-3 mb-0 text-muted">
                    <li>Log into the client's account directly at <a href="https://member.identityiq.com/Login.aspx" target="_blank" rel="noreferrer" className="fw-bold text-primary text-decoration-underline">IdentityIQ Login Portal</a>.</li>
                    <li>Accept any pending <strong>Terms & Conditions</strong> prompts or update security questions if prompted.</li>
                    <li>Ensure their subscription is active and manual report allocation limits haven't expired (Click <strong>"Refresh / Order Report"</strong> if visible).</li>
                    <li>Once cleared on their dashboard interface, close this window and run the execution sync again.</li>
                  </ol>
                </div>
              )}
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Close
        </Button>
        {!isLocked && !showLoading && (
            <Button variant={isUpdateMode ? "warning" : "primary"} onClick={handleSubmit} disabled={loading}>
            {loading ? (
                <>
                <span className="spinner-border spinner-border-sm me-2"/>
                Fetching...
                </>
            ) : isUpdateMode ? "Update Report" : "Start Fetch & Save"}
            </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}