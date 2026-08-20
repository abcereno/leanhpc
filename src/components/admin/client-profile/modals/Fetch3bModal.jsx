// components/modals/Fetch3bModal.jsx
import { useState, useEffect } from "react";
import { supabase } from "../../../../supabaseClient";
import { useAuth } from "../../../../context/AuthContext";
import { getEasternDateString } from "../../../../utils/timezone";
import useLogger from "../../../../hooks/useLogger";
import { useToast } from "../../../shared/ui/ToastNotifier";
import { computeBureauProgress } from "../../../../utils/inquiryCounts";
import { classifyInquiries } from "../../../../utils/classifyInquiries";
import { saveInitialAudit } from "../../../../utils/reportStorage";
import { runAuditEngine } from "../../../../utils/auditEngine";
import { buildThreadFromAudit } from "../../../../utils/buildThreadFromAudit";

const BUCKET = "clients";

export default function Fetch3BModal({
  clientId,
  onClose,
  isUpdateMode = false,
  onCustomSave,
  onSaved // 👈 Ensuring onSaved is here
}) {
  const { addToast } = useToast();
  const { adminName, userId } = useAuth();
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [fetching, setFetching] = useState(false);
  // Surfaced in the modal body while fetching — the whole flow (login,
  // analysis, thread build, save, up to 3 silent 10s retries) used to run
  // behind a single static "Fetching..." button with zero indication of
  // which step it was on or whether it had actually stalled vs. just
  // waiting out a retry delay.
  const [statusMessage, setStatusMessage] = useState("");

  const [showPassword, setShowPassword] = useState(false); 

  const logAction = useLogger();

  const [reportExists, setReportExists] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [clientName, setClientName] = useState("Client"); 

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      if (!clientId) return;
      try {
        const { data: clientRow } = await supabase
          .from("clients")
          .select("full_name, report_email, report_password")
          .eq("id", clientId)
          .single();
          
        if (mounted && clientRow) {
            setClientName(clientRow.full_name);
            if (clientRow.report_email) {
                setCredentials({
                    email: clientRow.report_email,
                    password: clientRow.report_password || ""
                });
            }
        }

        if (!isUpdateMode) {
          const { data } = await supabase.storage
            .from(BUCKET)
            .list(clientId, { search: "thread.json" });

          if (mounted && data && data.length > 0) {
            setReportExists(true);
          }
        }
      } catch (err) {
        console.error("Status check failed:", err);
      } finally {
        if (mounted) setCheckingStatus(false);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [clientId, isUpdateMode]);

  async function runCreditAnalysis(creds, months = 24) {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/credit_analysis`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ ...creds, months }),
      },
    );
    const payload = await res.json();
    if (!res.ok || !payload) {
      // credit_analysis's login-failure branches return extra diagnostic
      // fields (loginStatus, loginContentType, smartCreditResponse,
      // rawPreview — see supabase/functions/credit_analysis/index.ts)
      // specifically so the NEXT failure is self-explanatory instead of
      // just "Login failed" again. Only surfacing payload.error threw all
      // of that away before it ever reached the console/toast — append it
      // so it's visible without digging through the Network tab.
      const { error, ...diagnostics } = payload || {};
      const diagnosticStr = Object.keys(diagnostics).length
        ? ` | ${JSON.stringify(diagnostics)}`
        : "";
      throw new Error((error || "credit_analysis failed") + diagnosticStr);
    }
    return payload;
  }

  // credit_analysis's response is what the Funding Blueprint reads
  // (useClientCreditFiles.js pulls credit_analysis.json/.parsed.json) —
  // shared here so both the initial-import branch and the update branch
  // write it the same way instead of two copies drifting apart.
  async function saveAnalysisFiles(id, analysis) {
    const analysisBlob = new Blob([JSON.stringify(analysis, null, 2)], {
      type: "application/json",
    });
    await supabase.storage
      .from(BUCKET)
      .upload(`${id}/credit_analysis.json`, analysisBlob, {
        upsert: true,
        contentType: "application/json",
      });

    const parsed =
      analysis?.pdfData ||
      analysis?.parsed ||
      analysis?.report ||
      analysis?.data ||
      null;
    const parsedBlob = new Blob([JSON.stringify(parsed ?? {}, null, 2)], {
      type: "application/json",
    });
    await supabase.storage
      .from(BUCKET)
      .upload(`${id}/credit_analysis.parsed.json`, parsedBlob, {
        upsert: true,
        contentType: "application/json",
      });
  }

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const handleFetch3B = async () => {
    if (!isUpdateMode) {
      try {
        const { data } = await supabase.storage
          .from(BUCKET)
          .list(clientId, { search: "thread.json" });
        if (data && data.length > 0) {
          addToast({ title: "Security Block", message: "Report already exists.", variant: "danger", icon: "bi-shield-exclamation" });
          setReportExists(true);
          return;
        }
      } catch (e) {
        console.error("Security check error", e);
      }
    }

    if (!credentials.email || !credentials.password) {
      addToast({ title: "Missing Fields", message: "Please enter both Email and Password.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    setFetching(true);
    let attempts = 0;
    const maxRetries = 3;
    let success = false;

    while (attempts < maxRetries) {
      try {
        setStatusMessage(
          attempts === 0
            ? "Logging into SmartCredit…"
            : `Retry ${attempts + 1} of ${maxRetries}: logging into SmartCredit…`,
        );
        let rawData = null;
        try {
          console.log("Attempting to fetch raw report...");
          const rawRes = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch_3b_raw`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify(credentials),
            },
          );

          const contentType = rawRes.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const json = await rawRes.json();
            if (rawRes.ok) {
              rawData = json.report || json;
            } else {
              // fetch_3b_raw always responds with Content-Type: application/json,
              // including its error branches (loginStatus/loginContentType/
              // rawPreview/htmlPreview — see supabase/functions/fetch_3b_raw/
              // index.ts) — so a failure still lands in this branch, not the
              // "did not return JSON" one below. Log the actual diagnostic
              // payload instead of silently discarding it; this path is
              // non-fatal (handleFetch3B continues via credit_analysis
              // regardless), so it would otherwise vanish with zero trace.
              console.warn("⚠️ fetch_3b_raw failed:", json);
            }
          } else {
            console.warn("⚠️ fetch_3b_raw did not return JSON.");
          }

        } catch (rawErr) {
          console.error("⚠️ fetch_3b_raw block failed:", rawErr);
        }

        // credit_analysis and fetch_3b_report used to each log into
        // SmartCredit separately to fetch the exact same report
        // fetch_3b_raw just pulled — three logins for one "fetch report"
        // action, tripling the odds of hitting SmartCredit's Cloudflare
        // bot-challenge on any given attempt, and letting the three
        // resulting files reflect three slightly different fetches of
        // "the same" report. Both edge functions now accept the
        // already-fetched raw report and skip their own login when it's
        // present — falling back to a fresh login only if fetch_3b_raw
        // itself failed above.
        setStatusMessage("Analyzing credit report…");
        const analysisRequestBody = rawData ? { rawReport: rawData } : credentials;
        const analysis = await runCreditAnalysis(analysisRequestBody, 24);

        if (isUpdateMode && onCustomSave) {
          if (!rawData)
            throw new Error(
              "Could not retrieve raw report for update. Please try again.",
            );
          setStatusMessage("Saving updated report…");
          // saveUpdateAudit refreshes raw_credit_report.json (the
          // canonical "current report" file), client_audit_report.json,
          // the daily progress snapshot, and score history — see
          // utils/reportStorage.js. It deliberately does NOT touch
          // thread.json, so dispute progress is never reset by an update.
          await onCustomSave(rawData, analysis);
          // credit_analysis.json / credit_analysis.parsed.json (what the
          // Funding Blueprint reads) used to only get written on initial
          // import — frozen after that, same bug raw_credit_report.json
          // had. Refresh them here too so Funding Blueprint stays in sync
          // with every report update, not just the first one.
          await saveAnalysisFiles(clientId, analysis);
          success = true;
          break;
        }

        // Thread payload (accounts/inquiries bucketed by bureau) used to
        // come from a THIRD separate SmartCredit login via fetch_3b_report
        // — redundant now that we already have rawData and can parse it
        // locally with the same auditEngine.js every other display surface
        // uses. See utils/buildThreadFromAudit.js.
        if (!rawData)
          throw new Error(
            "Could not retrieve raw report. Please try again.",
          );
        setStatusMessage("Building dispute thread…");
        const auditResult = runAuditEngine(rawData);
        const data = buildThreadFromAudit(auditResult);

        // Admin-side initial import, so run this through the same AI
        // classifier SmartIdiQModal.jsx's quick-add flow already uses —
        // lands pre-classified instead of forcing a full manual pass in
        // the thread editor. See utils/classifyInquiries.js for the
        // never-throws fallback behavior.
        setStatusMessage("Classifying inquiries…");
        const classified = await classifyInquiries({
          accounts: data.accounts,
          experian: data.experian,
          transunion: data.transunion,
          equifax: data.equifax,
        });

        const addId = (item) => ({
            ...item,
            id: item.id || generateId(),
            classification: item.classification || 'non-linked'
        });

        const accountsWithIds = (data.accounts || []).map(addId);
        const expWithIds = (classified.experian || []).map(addId);
        const tuWithIds = (classified.transunion || []).map(addId);
        const eqWithIds = (classified.equifax || []).map(addId);

        const threadPayload = {
          accounts: accountsWithIds,
          experian: expWithIds,
          transunion: tuWithIds,
          equifax: eqWithIds,
        };

        // Shared with every other save path (utils/inquiryCounts.js) —
        // the local version this replaced omitted "dnd" from its na/done
        // checks, so a bureau made entirely of Do-Not-Dispute items would
        // never read as N/A. This is an initial import, so almost
        // everything will be "non-linked" anyway, but using the real
        // shared function means progress/completion is always correct
        // even if the fetched data ever arrives pre-classified.
        const newProgress = computeBureauProgress(threadPayload);

        setStatusMessage("Saving report…");
        const threadBlob = new Blob([JSON.stringify(threadPayload, null, 2)], {
          type: "application/json",
        });
        await supabase.storage
          .from(BUCKET)
          .upload(`${clientId}/thread.json`, threadBlob, {
            upsert: true,
            contentType: "application/json",
          });

        await saveAnalysisFiles(clientId, analysis);

        // Day-0 baseline: saveInitialAudit (utils/reportStorage.js) writes
        // raw_credit_report.json, client_audit_report.json, today's
        // progress snapshot, and the first score-history entry — the same
        // pipeline "Update Report" already ran through onCustomSave above.
        // This was never actually called anywhere before (dead export), so
        // a brand-new client needed a SECOND report update before Progress
        // Report had two snapshots to compare — now the very first import
        // gives it a real starting point immediately. Non-fatal: thread.json
        // and the client's progress fields (below) are the load-bearing
        // parts of an initial import, so a failure here shouldn't block it.
        if (rawData) {
          try {
            await saveInitialAudit(clientId, rawData, analysis);
          } catch (auditErr) {
            console.warn("⚠️ Could not save initial audit snapshot:", auditErr);
          }
        }

        const { error: updateError } = await supabase
          .from("clients")
          .update({
            counter: adminName,
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
          })
          .eq("id", clientId);

        // 👇 FIX: Removed the hardcoded alert() here! 👇
        if (updateError) {
          console.warn(`⚠️ Files saved but failed to reset progress: ${updateError.message}`);
        }

        try {
          if (userId) {
            await supabase.rpc("increment_call_metrics", {
              uid: userId,
              ldate: getEasternDateString(),
              total_calls: 0,
              total_docs: 0,
              total_disputes: 0,
              total_confirmed: 0,
              total_unable_to_dispute: 0,
              total_disconnected: 0,
              total_count: 1,
            });
          }
        } catch (e) {
          console.error("Metrics error:", e);
        }

        success = true;
        break;
      } catch (err) {
        attempts++;
        if (attempts >= maxRetries) {
          setStatusMessage("");
          addToast({ title: "Failed", message: "Failed after 3 attempts: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill", timeout: 8000 });
          break;
        } else {
          console.log(`Retrying (${attempts}) in 10 seconds...`, err);
          // Surface the actual failure reason during the wait instead of
          // leaving the modal looking frozen for 10 silent seconds each
          // retry — this was the "no indicators" gap.
          setStatusMessage(`${err.message || "Attempt failed"} — retrying in 10s (attempt ${attempts + 1} of ${maxRetries})…`);
          await new Promise((res) => setTimeout(res, 10000));
        }
      }
    }

    setStatusMessage("");

    if (success) {
      await supabase.from("clients").update({
          report_email: credentials.email,
          report_password: credentials.password
      }).eq("id", clientId);

      try {
        await logAction({
          action: isUpdateMode ? "update_3b" : "fetch_3b", 
          targetId: clientId,
          targetName: clientName, 
          details: isUpdateMode
            ? "Updated 3B report data via SmartCredit."
            : "Performed initial 3B report import and initialized client.",
        });
      } catch (logErr) {
        console.warn("Skipping analytics log (User is likely a partner).");
      }

      // Automatically triggers the Quick Import dropdown to transition silently
      if (onSaved) {
          onSaved();
      } else {
          onClose(); 
      }
    }

    setFetching(false);
  };

  const isLocked = !isUpdateMode && reportExists;
  const showLoading = !isUpdateMode && checkingStatus;

  return (
    <div
      className="modal fade show d-block text-start"
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog">
        <div className="modal-content border-0 shadow">
          <div className="modal-header bg-light border-0 pb-2">
            <h5 className="modal-title fw-bold text-dark">
              {isUpdateMode
                ? "🔄 Update Report (SmartCredit)"
                : "📄 Import Report (SmartCredit)"}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body pt-3">
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
                <span className="small text-muted">Checking status...</span>
              </div>
            )}

            {!isLocked && !showLoading && (
              <>
                <p className="small text-muted mb-4">
                  {isUpdateMode
                    ? "Updates Dashboard. Does NOT reset dispute progress."
                    : "Fetches data and initializes client."}
                </p>

                {fetching && statusMessage && (
                  <div className="alert alert-primary d-flex align-items-center py-2 px-3 mb-3 small">
                    <span className="spinner-border spinner-border-sm me-2 flex-shrink-0"></span>
                    <span>{statusMessage}</span>
                  </div>
                )}

                <div className="form-group mb-3">
                    <label className="small fw-bold text-muted text-uppercase mb-1">Email</label>
                    <input
                      className="form-control bg-light"
                      type="email"
                      value={credentials.email}
                      onChange={(e) =>
                        setCredentials({
                          ...credentials,
                          email: e.target.value.replace(/\s+/g, ""),
                        })
                      }
                      disabled={fetching || isLocked}
                    />
                </div>

                <div className="form-group mb-3">
                    <label className="small fw-bold text-muted text-uppercase mb-1">Password</label>
                    <div className="input-group">
                        <input
                          className="form-control bg-light border-end-0"
                          type={showPassword ? "text" : "password"}
                          value={credentials.password}
                          onChange={(e) =>
                            setCredentials({
                              ...credentials,
                              password: e.target.value.replace(/\s+/g, ""),
                            })
                          }
                          disabled={fetching || isLocked}
                        />
                        <button 
                          className="btn btn-light border border-start-0 text-muted px-3" 
                          type="button" 
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={fetching || isLocked}
                        >
                          <i className={`bi bi-eye${showPassword ? '-slash-fill text-primary' : '-fill'}`}></i>
                        </button>
                    </div>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer bg-light border-0">
            <button
              className="btn btn-secondary"
              onClick={onClose}
              disabled={fetching}
            >
              Cancel
            </button>
            {!isLocked && !showLoading && (
              <button
                className={`btn fw-bold px-4 shadow-sm ${isUpdateMode ? "btn-warning" : "btn-primary"}`}
                onClick={handleFetch3B}
                disabled={fetching}
              >
                {fetching
                  ? "Fetching..."
                  : isUpdateMode
                    ? "Update Report"
                    : "Fetch & Initialize"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}