import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import useLogger from "./useLogger";
import { calculateFundingEligibility } from "../utils/funderRules";
import {
  isBlankStartInquiries,
  computeDisputePendingCounts,
  DISPUTE_PENDING_CLASSIFICATIONS,
  normalizeClassification,
  isNonDisputableClassification,
  computeBureauProgress,
} from "../utils/inquiryCounts";
import { syncCountReviewRequests, buildApprovedCountsForApprover } from "../utils/countReviewSync";
import { formatDurationBetween } from "../utils/formatDuration";
import { useToast } from "../components/shared/ui/ToastNotifier";

const BUCKET = "clients"; 
const APP_SCRIPT_URL = import.meta.env.VITE_APP_SCRIPT_URL;

// 👇 UPDATED WEBHOOK URL 👇
const COMPLETION_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/423af280-1504-4014-9f5e-f10b9bbc0985";

// normClass/isIgnoredStatus are aliases onto utils/inquiryCounts.js's
// shared normalizeClassification/isNonDisputableClassification — kept
// under their original names here since they're used throughout this
// whole file, but no longer a locally-owned copy that could drift out of
// sync with the same logic in reportAutoImport.js/Fetch3bModal.jsx/
// SmartIdiQModal.jsx (see computeBureauProgress's own comment for the bug
// that drift actually caused).
const normClass = normalizeClassification;
const isIgnoredStatus = isNonDisputableClassification;
// Shared with the automatic count-review sync below and utils/inquiryCounts.js
// so "what's disputable" can never drift between letter generation and the
// supervisor approval flow.
const DISPUTABLE = DISPUTE_PENDING_CLASSIFICATIONS;

export default function useInquiriesThread({ 
  clientId, 
  userId: propUserId, 
  adminName: propAdminName, 
  clientName: propClientName, 
  letterAssets, 
  initialData = null 
}) {
  const id = clientId;

  const { user, hasPermission } = useAuth();
  const userId = propUserId || user?.id;
  const logAction = useLogger();
  const { addToast } = useToast();

  const [inquiries, setInquiries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [counts, setCounts] = useState({ total: 0, perBureau: {}, perClassification: {} });

  // HPC Ops Sprint Priority 2 (Count Review) — the supervisor-approved "how
  // many inquiries are actually cleared to be disputed/removed" per bureau.
  // No AI/OCR count involved (see utils/countReviewSync.js) — it's simply
  // the classification-based dispute count a supervisor has signed off on.
  // Populated on mount and refreshed after every save (see
  // fetchApprovedCounts below) so InquiriesThread.jsx can show it as an info
  // panel. Approval itself happens out-of-band via the Count Review queue
  // (src/hooks/useCountReviews.js) — this hook only ever reads these
  // columns, never writes approved_*_count to a supervisor-set value.
  const [approvedCounts, setApprovedCounts] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("All");
  const [accountTab, setAccountTab] = useState("All");
  const [isGenerating, setIsGenerating] = useState(false);

  const startTimeRef = useRef(null);
  const previousThreadRef = useRef({ accounts: [], experian: [], transunion: [], equifax: [] });

  // --- Helpers ---
  const updateCounts_ = useCallback((list) => {
    const perBureau = { Experian: 0, TransUnion: 0, Equifax: 0 };
    const perClassification = { Experian: {}, TransUnion: {}, Equifax: {} };

    list.forEach(({ bureau, classification }) => {
      const bKey = bureau === "EX" ? "Experian" : bureau === "TU" ? "TransUnion" : bureau === "EQ" ? "Equifax" : bureau;
      if (perBureau[bKey] !== undefined) perBureau[bKey] = (perBureau[bKey] || 0) + 1;
      if (bKey && classification) {
        if (!perClassification[bKey]) perClassification[bKey] = {};
        perClassification[bKey][classification] = (perClassification[bKey][classification] || 0) + 1;
      }
    });

    setCounts({ total: list.length, perBureau, perClassification });
  }, []);

  async function sendCompletionWebhook({ clientId, statuses, newlyCompleted, reason = "transition_only" }) {
    if (!COMPLETION_WEBHOOK_URL) return;
    const { data: clientRow, error: clientErr } = await supabase
      .from("clients")
      .select("id, full_name, email, phone, admin_id, company_id, company_name, agent_id, agent")
      .eq("id", clientId)
      .single();
      
    if (clientErr || !clientRow) return;

    let adminName = null;
    if (clientRow.admin_id) {
      const { data: adminRow } = await supabase.from("profiles").select("full_name").eq("id", clientRow.admin_id).single();
      if (adminRow) adminName = adminRow.full_name;
    }

    const payload = {
      client: { 
        id: clientRow.id, 
        full_name: clientRow.full_name || "", 
        email: clientRow.email || "", 
        phone: clientRow.phone || "", 
        admin_id: clientRow.admin_id || null, 
        admin_name: adminName,
        company_id: clientRow.company_id || null,
        company_name: clientRow.company_name || "",
        agent_id: clientRow.agent_id || null,
        agent_name: clientRow.agent || ""
      },
      statuses, 
      completed: newlyCompleted, 
      reason, 
      completed_at: new Date().toISOString(),
    };

    console.log("🚀 Firing 100% Webhook Payload to LeadConnector:", payload);

    try {
      const res = await fetch(COMPLETION_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      console.log("✅ Webhook response status:", res.status);
    } catch (e) {
      console.error("❌ Error sending completion webhook:", e);
      try { await fetch(COMPLETION_WEBHOOK_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); } catch(e2) {console.log(e2);}
    }
  }

  // --- Fetch ---
  const fetchInquiriesThread = useCallback(async () => {
    if (!id) return [];
    setLoading(true);
    setError(null);
    let combined = [];
    const { data: threadFile } = supabase.storage.from(BUCKET).getPublicUrl(`${id}/thread.json`);
    
    if (threadFile?.publicUrl) {
      try {
        const res = await fetch(`${threadFile.publicUrl}?cacheBust=${Date.now()}`);
        if (!res.ok) throw new Error("File not found");
        const json = await res.json();
        previousThreadRef.current = JSON.parse(JSON.stringify(json || {}));
        
        if (json) {
          const acc = [...(json.accounts || [])];
          const processBureau = (arr, bureauName) => (arr || []).map((i) => ({ ...i, bureau: bureauName, classification: i.classification || "non-linked" }));
          const experian = processBureau(json.experian, "Experian");
          const transunion = processBureau(json.transunion, "TransUnion");
          const equifax = processBureau(json.equifax, "Equifax");
          combined = [...experian, ...transunion, ...equifax];
          setInquiries(combined);
          setAccounts(acc);
          updateCounts_(combined);
        }
      } catch (err) {
        console.log(err);
        setInquiries([]); setAccounts([]); updateCounts_([]);
      }
    }
    setLoading(false);
    if (!startTimeRef.current) startTimeRef.current = Date.now();
    return combined;
  }, [id, updateCounts_]);

  useEffect(() => {
    if (initialData) {
        const formatted = initialData.map((item, index) => {
            let bFull = item.bureau;
            if(bFull === "EX") bFull = "Experian"; if(bFull === "TU") bFull = "TransUnion"; if(bFull === "EQ") bFull = "Equifax";
            return { id: `temp-${index}`, creditor: item.creditor, creditor_name: item.creditor, bureau: bFull, date: item.date, classification: item.classification || 'non-linked', ...item };
        });
        setInquiries(formatted); updateCounts_(formatted); setLoading(false);
        if (!startTimeRef.current) startTimeRef.current = Date.now();
        return; 
    }
    fetchInquiriesThread();
  }, [initialData, fetchInquiriesThread, updateCounts_]);

  // Loads the current approved-to-dispute numbers for the "Approved to
  // Dispute" info panel (InquiriesThread.jsx). Best-effort — a missing
  // approved_*_count column (sql/phase0_persisted_counts.sql not yet run)
  // should never block the rest of the page from working. No AI/OCR count
  // involved — see utils/countReviewSync.js.
  const fetchApprovedCounts = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error: err } = await supabase
        .from("clients")
        .select("approved_exp_count, approved_tu_count, approved_eq_count")
        .eq("id", id)
        .maybeSingle();
      if (err) throw err;
      setApprovedCounts(data || null);
    } catch (err) {
      console.warn("Could not load approved counts (run sql/phase0_persisted_counts.sql if it doesn't exist yet):", err.message);
    }
  }, [id]);

  useEffect(() => { fetchApprovedCounts(); }, [fetchApprovedCounts]);

  // --- SAVE ---
  const saveUpdatedThread = useCallback(async (overrideInquiries = null, forceWebhook = false) => {
    if (!id) return false; 
    setSaving(true);
    
    const activeInquiries = overrideInquiries || inquiries;

    try {
        let realClientName = propClientName;
        if (!realClientName) {
            const { data: c } = await supabase.from("clients").select("full_name").eq("id", id).single();
            if (c?.full_name) realClientName = c.full_name;
        }
        const finalClientName = realClientName || "Client"; 

        // --- RESET LOGIC ---
        if (activeInquiries.length === 0 && accounts.length === 0) {
            const confirmClear = window.confirm("You have removed all items. This will clear the client's progress. Continue?");
            if (!confirmClear) { setSaving(false); return false; }
            
            const emptyThread = { accounts: [], experian: [], transunion: [], equifax: [] };
            const blob = new Blob([JSON.stringify(emptyThread)], { type: "application/json" });
            const { error: uploadError } = await supabase.storage.from(BUCKET).upload(`${id}/thread.json`, blob, { upsert: true });
            if (uploadError) throw uploadError;
            
            const { error: resetErr } = await supabase.from("clients").update({
                counter: null, progress: 0, exp_completed: false, tu_completed: false, eq_completed: false,
                exp_na: null, tu_na: null, eq_na: null, processing_duration: null, start_inquiries: null,
                admin_id: null, funding_status: 'UNKNOWN', completed_at: null
            }).eq("id", id);

            if (resetErr) throw resetErr;

            // Best-effort, isolated — same reasoning as the main save path
            // below: counted_at is optional metadata and a missing column
            // here should never block a legitimate reset.
            try {
                await supabase.from("clients").update({ counted_at: null }).eq("id", id);
            } catch (countedAtErr) {
                console.warn("Could not clear counted_at on reset:", countedAtErr);
            }

            await logAction({
                action: "reset_client",
                targetId: id,
                targetName: finalClientName,
                details: "Cleared all inquiries and accounts (Reset)."
            });

            addToast({ title: "Thread Reset", message: "Cleared all inquiries and accounts.", variant: "success", icon: "bi-arrow-counterclockwise" });
            previousThreadRef.current = emptyThread;
            return true; 
        }

        // --- PREPARE DATA ---
        const sanitizedInquiries = activeInquiries.map(i => ({ ...i, classification: i.classification || "non-linked" }));
        
        const grouped = {
            accounts,
            experian: sanitizedInquiries.filter((i) => i.bureau === "Experian"),
            transunion: sanitizedInquiries.filter((i) => i.bureau === "TransUnion"),
            equifax: sanitizedInquiries.filter((i) => i.bureau === "Equifax"),
        };

        // --- SAVE TO STORAGE ---
        const blob = new Blob([JSON.stringify(grouped, null, 2)], { type: "application/json" });
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(`${id}/thread.json`, blob, { upsert: true });
        if (uploadError) throw new Error("Error saving file: " + uploadError.message);

        // --- LOG REMOVALS ---
        try {
            const today = new Date().toISOString().split("T")[0];
            const removals = ["Experian", "TransUnion", "Equifax"].map((bureau) => {
                const currentDeleted = grouped[bureau.toLowerCase()].filter((i) => normClass(i.classification) === "deleted");
                const previousDeleted = previousThreadRef.current[bureau.toLowerCase()]?.filter((i) => normClass(i.classification) === "deleted") || [];
                const prevSet = new Set(previousDeleted.map((i) => JSON.stringify(i)));
                const newOnly = currentDeleted.filter((i) => !prevSet.has(JSON.stringify(i)));
                
                if (newOnly.length > 0) return { client_id: id, admin_id: userId, bureau, removed_count: newOnly.length, log_date: today };
                return null;
            }).filter(Boolean);
            
            if (removals.length > 0) await supabase.from("inquiry_removals").insert(removals);
        } catch (logError) { console.warn("Log error", logError); }

        // --- CALCULATE NEW PROGRESS LOGIC ---
        // Single shared computation (utils/inquiryCounts.js#computeBureauProgress)
        // for both the previous and new state, so "did this save just cross
        // into 100% complete" and the actual progress/completion/na flags
        // written below can never drift apart from each other or from any
        // other save path.
        const prevProgress = computeBureauProgress(previousThreadRef.current);
        const prevIsFullyCompleted = prevProgress.isFullyCompleted;

        const newProgress = computeBureauProgress(grouped);
        const { isFullyCompleted, progress: progressDecimal, deletedCount, disputableCount } = newProgress;
        const expStatus = newProgress.expStatus;
        const tuStatus = newProgress.tuStatus;
        const eqStatus = newProgress.eqStatus;

        const timeTakenLabel = formatDurationBetween(startTimeRef.current);

        let finalStartInq = null;
        const { data: currentClient, error: currentClientErr } = await supabase
            .from("clients")
            .select("start_inquiries")
            .eq("id", id)
            .single();
        if (currentClientErr) {
            // Not fatal to the save — worst case we recompute start_inquiries
            // fresh below instead of reusing a frozen value — but surfaced
            // loudly since a client row that fails to even SELECT usually
            // means something is wrong with the id or connection.
            console.warn("Could not read current client before save:", currentClientErr.message);
        }
        if (currentClient?.start_inquiries && !isBlankStartInquiries(currentClient.start_inquiries)) {
            finalStartInq = currentClient.start_inquiries;
        } else {
            const countDisputable = (list) => list.filter(i => !isIgnoredStatus(i.classification)).length;
            finalStartInq = `(TU ${countDisputable(grouped.transunion)}, EXP ${countDisputable(grouped.experian)}, EQ ${countDisputable(grouped.equifax)})`;
        }

        let adminNameForCounter = propAdminName || "Staff";
        if (!propAdminName && userId) {
            const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
            if (profile?.full_name) adminNameForCounter = profile.full_name;
        }

        // CALCULATE FUNDING ELIGIBILITY ON THE FLY
        let finalFundingStatus = 'UNKNOWN';
        try {
            const { data: files } = await supabase.storage.from(BUCKET).list(id, { limit: 10 });
            const jsonFile = files?.find(f => f.name.endsWith('.json') && !f.name.includes('parsed') && f.name !== 'thread.json') || 
                             files?.find(f => f.name.endsWith('.json') && f.name !== 'thread.json');

            if (jsonFile) {
                const { data: fileBlob } = await supabase.storage.from(BUCKET).download(`${id}/${jsonFile.name}`);
                const reportJson = JSON.parse(await fileBlob.text());

                const settings = { inquiryMonths: 6, maxInqCount: 2, maxUtil: 35, minAccts: 5 };
                const analysis = calculateFundingEligibility(reportJson, settings);

                const activeInqs = totalAll.filter(inq => normClass(inq.classification) !== 'deleted');
                
                const cutoffDate = new Date();
                cutoffDate.setMonth(cutoffDate.getMonth() - settings.inquiryMonths);
                
                let recentCount = 0;
                activeInqs.forEach(inq => {
                    const dateStr = inq.date || inq.Date;
                    if (dateStr && new Date(dateStr) >= cutoffDate) recentCount++;
                    else if (!dateStr) recentCount++; 
                });

                let newStatus = "GREEN";
                if (analysis.metrics.utilization > settings.maxUtil) newStatus = "RED";
                if (analysis.metrics.revolving_accounts < settings.minAccts) newStatus = newStatus === "RED" ? "RED" : "YELLOW";
                if (recentCount > settings.maxInqCount) newStatus = "RED";
                
                finalFundingStatus = newStatus;
            }
        } catch (fundingErr) {
            console.warn("Could not calculate funding status during save:", fundingErr);
        }

        // --- PRIORITY 2: CLASSIFICATION-BASED DISPUTE COUNT ---
        // No AI/OCR count involved — this is simply how many inquiries are
        // currently classified Non-Linked/Associated/Dispute (see
        // utils/inquiryCounts.js#computeDisputePendingCounts), i.e. exactly
        // what the admin/company/individual just set by classifying and
        // hitting Save.
        //
        // approved_*_count is the supervisor-facing "cleared to dispute"
        // number: someone WITH approve_count_reviews is trusted to set it
        // directly, live, on every save of their own. Someone WITHOUT it
        // never touches this column at all — it stays whatever a supervisor
        // last approved (or null/"Pending" if nobody has yet) until they
        // review the queued request below.
        const disputeCounts = computeDisputePendingCounts(grouped);
        const canApproveCounts = hasPermission("approve_count_reviews");
        const approvedCountsPayload = canApproveCounts ? buildApprovedCountsForApprover(disputeCounts) : {};

        // --- UPDATE CLIENT DB ---
        // counted_at is deliberately NOT in this payload — it's an optional,
        // best-effort timestamp (see the isolated write further below). This
        // payload carries the fields that actually matter to the admin
        // (counter, start_inquiries, progress, completion state), and a
        // schema issue with one extra optional column should never be able
        // to silently take the whole save down with it again.
        const dbPayload = {
            progress: progressDecimal,
            exp_completed: newProgress.exp_completed, tu_completed: newProgress.tu_completed, eq_completed: newProgress.eq_completed,
            exp_na: newProgress.exp_na, tu_na: newProgress.tu_na, eq_na: newProgress.eq_na,
            processing_duration: timeTakenLabel,
            start_inquiries: finalStartInq,
            counter: adminNameForCounter,
            admin_id: userId,
            funding_status: finalFundingStatus,
            ...approvedCountsPayload,
        };

        // 👇 NEW: Inject completed_at if hitting 100% right now 👇
        if (isFullyCompleted && !prevIsFullyCompleted) {
            dbPayload.completed_at = new Date().toISOString();
        } else if (!isFullyCompleted) {
            dbPayload.completed_at = null; // Reverts completed_at if a user un-checks an item
        }

        // This is the update that matters — counter/start_inquiries/progress
        // all live here. A Postgres error (e.g. a stale/mismatched column)
        // used to be silently swallowed, which meant the admin saw "saved"
        // even though NOTHING was written and AdminClientList kept showing
        // blank counter/start_inquiries with no indication anything failed.
        // Throwing here surfaces that failure through the catch block below.
        const { error: updateError } = await supabase.from("clients").update(dbPayload).eq("id", id);
        if (updateError) throw new Error("Failed to save classification changes: " + updateError.message);

        // --- PRIORITY 2: SUPERVISOR COUNT REVIEW (automatic) ---
        // Every save by a non-approver that leaves any bureau with
        // Non-Linked/Associated/Dispute items asks a supervisor to confirm
        // how many of those are actually approved to be disputed/removed —
        // no employee action required (see utils/countReviewSync.js, shared
        // with InquirySelectionModal.jsx's company-portal flow). Best-effort
        // and non-blocking: a problem here should never make the
        // classification save itself look like it failed.
        if (!canApproveCounts) {
            try {
                await syncCountReviewRequests(id, disputeCounts, userId);
            } catch (reviewSyncErr) {
                console.warn("Could not sync count review requests:", reviewSyncErr);
            }
        }

        // Refresh the approved-to-dispute numbers shown in InquiriesThread.jsx
        // — cheap best-effort re-fetch, not worth blocking the save on.
        fetchApprovedCounts();

        // Best-effort, isolated: records when a human first actually saved
        // real classifications for this client (frozen once set, same
        // pattern as start_inquiries) — see sql/add_counted_at.sql. Kept
        // separate from the payload above so that if this column doesn't
        // exist yet on this database, it fails quietly here instead of
        // blocking the real save.
        try {
            const { data: countedRow } = await supabase
                .from("clients")
                .select("counted_at")
                .eq("id", id)
                .maybeSingle();
            if (!countedRow?.counted_at) {
                await supabase.from("clients").update({ counted_at: new Date().toISOString() }).eq("id", id);
            }
        } catch (countedAtErr) {
            console.warn("Could not set counted_at (run sql/add_counted_at.sql if it doesn't exist yet):", countedAtErr);
        }

        // --- WEBHOOK FIRING LOGIC ---
        const statuses = { exp: expStatus === "done", tu: tuStatus === "done", eq: eqStatus === "done" };
        
        if ((isFullyCompleted && !prevIsFullyCompleted) || forceWebhook) {
             console.log("🎉 Progress hit 100% or Forced! Firing webhook...");
             await sendCompletionWebhook({ 
                 clientId: id, 
                 statuses, 
                 newlyCompleted: { exp: true, tu: true, eq: true },
                 reason: "all_non_linked_deleted_100_percent" 
             });
        }

        // --- AI TRAINING ---
        const prevFlat = [
            ...(previousThreadRef.current?.experian || []),
            ...(previousThreadRef.current?.transunion || []),
            ...(previousThreadRef.current?.equifax || [])
        ];

        const corrections = [];
        sanitizedInquiries.forEach(newItem => {
            const oldItem = prevFlat.find(old => old.creditor === newItem.creditor && old.date === newItem.date && old.bureau === newItem.bureau);
            if (oldItem && oldItem.classification !== newItem.classification) {
                const isCritical = newItem.classification === 'linked'; 
                corrections.push({
                    creditor: newItem.creditor,
                    bureau: newItem.bureau,
                    ai_prediction: oldItem.classification,
                    human_correction: newItem.classification,
                    is_critical_safety: isCritical, 
                    date_corrected: new Date().toISOString()
                });
            }
        });

        if (corrections.length > 0) {
            try {
                await supabase.from("ai_training_logs").insert({
                    provider: "Manual_Correction",
                    raw_text_snippet: `Corrected ${corrections.length} items for ${finalClientName}`,
                    detected_counts: {
                        summary: "Human corrected AI classifications",
                        total_corrections: corrections.length,
                        critical_linked_fixes: corrections.filter(c => c.is_critical_safety).length,
                        corrections_list: corrections, 
                        final_state: grouped 
                    },
                    created_at: new Date().toISOString(),
                    user_id: userId
                });
            } catch (aiError) {
                console.warn("AI Log Error:", aiError);
            }
        }

        // --- FINALIZE ---
        setInquiries(sanitizedInquiries);
        updateCounts_(sanitizedInquiries);

        await logAction({
            action: "update_thread",
            targetId: id, 
            targetName: finalClientName,
            details: `Updated thread. Progress: ${progressDecimal}. Corrections: ${corrections.length}`
        });

        previousThreadRef.current = grouped;

        console.log("Hook: Save successful");
        return true;

    } catch (e) {
        console.error("Hook: Save failed", e);
        addToast({ title: "Save Failed", message: e.message, variant: "danger", icon: "bi-exclamation-triangle-fill", timeout: 8000 });
        return false;
    } finally {
        setSaving(false);
    }
  }, [accounts, inquiries, id, userId, propAdminName, propClientName, updateCounts_, logAction, hasPermission, addToast, syncCountReviewRequests, fetchApprovedCounts]);

  const generateDisputeLetters = useCallback(async (round = 1, isFastResolution = false) => {
    console.log("🚀 Starting generation...", { round, isFastResolution, APP_SCRIPT_URL, id });

    if (!APP_SCRIPT_URL || !id) {
        if (!APP_SCRIPT_URL) addToast({ title: "Configuration Error", message: "VITE_APP_SCRIPT_URL is missing in your .env file.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
        return;
    }
    
    setIsGenerating(true);

    try {
      const latest = await fetchInquiriesThread();
      const baseList = Array.isArray(latest) && latest.length ? latest : inquiries;
      
      const { data: clientRow } = await supabase.from("clients").select("full_name, address, dob, ssn").eq("id", id).single();
      if (!clientRow) throw new Error("Client not found");
      
      const ssnLast4 = String(clientRow.ssn || "").replace(/\D/g, "").slice(-4);
      const clientForLetter = { ...clientRow, ssn: ssnLast4, ssn_last4: ssnLast4 };
      
      // Look for non-linked, associated, or dispute items
      const disputable = baseList.filter((i) => DISPUTABLE.has(normClass(i.classification)));
      
      if (!disputable.length) {
        addToast({ title: "Nothing to Generate", message: "No non-linked or disputable inquiries found. Items marked 'deleted' are ignored for new letters.", variant: "warning", icon: "bi-info-circle-fill" });
        setIsGenerating(false);
        return;
      }
      
      const byBureau = disputable.reduce((acc, i) => {
        let b = i.bureau || "Unknown";
        if(b === "EX" || b === "Experian") b = "Experian"; 
        if(b === "TU" || b === "TransUnion") b = "TransUnion"; 
        if(b === "EQ" || b === "Equifax") b = "Equifax"; 
        (acc[b] ||= []).push({ creditor: i.creditor, date: i.date });
        return acc;
      }, {});

      const signAsset = async (path) => {
        if (!path) return null;
        if (path.startsWith("http")) return path; 
        
        const cleanPath = path.replace(/^cover-letter-assets\//, "");
        const { data, error } = await supabase.storage.from("cover-letter-assets").createSignedUrl(cleanPath, 300); 
        return data?.signedUrl || null;
      };

      const assets = {
        licenseUrl: await signAsset(letterAssets?.licenseUrl),
        ssnUrl: await signAsset(letterAssets?.ssnUrl),
        poaUrl: await signAsset(letterAssets?.poaUrl)
      };

      const reqs = Object.entries(byBureau).map(async ([bureau, list]) => {
          try {
              const res = await fetch(APP_SCRIPT_URL, { 
                method: "POST", 
                headers: { "Content-Type": "text/plain;charset=utf-8" }, 
                body: JSON.stringify({ 
                  client_id: id, 
                  client: clientForLetter, 
                  bureau, 
                  inquiries: list, 
                  assets,
                  round: round,
                  fast_resolution: isFastResolution
                }) 
              });
              const txt = await res.text();
              return { bureau, ok: true, json: JSON.parse(txt) };
          } catch(e) { 
              console.error(`Fetch failed for ${bureau}:`, e);
              return { bureau, ok: false, error: e.message }; 
          }
      });

      const results = await Promise.all(reqs);
      
      const saveRows = results
        .filter(r => r.ok && r.json.status === "success")
        .map(r => ({ 
          client_id: id, 
          file_name: `Round ${round} - ${r.bureau} Cover Letter`, 
          file_url: r.json.pdfPublicUrl || r.json.url, 
          uploaded_by: userId 
        }));
      
      if(saveRows.length > 0) { 
          await supabase.from("client_documents").insert(saveRows); 
          await logAction({
             action: "generate_letters",
             targetId: id,
             targetName: clientRow.full_name || propClientName || "Client",
             details: `Generated Round ${round} letters for ${results.length} bureaus.`
          });
          addToast({ title: "Letters Generated", message: `Round ${round} letters saved to the Documents tab.`, variant: "success", icon: "bi-file-earmark-check-fill" });
      } else {
          addToast({ title: "Generation Failed", message: "Please check the browser console for details.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
          console.log("App Script Results:", results);
      }

    } catch (err) {
      console.error("Generate Error", err);
      addToast({ title: "Generation Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill", timeout: 8000 });
    } finally {
      setIsGenerating(false);
    }
  }, [id, inquiries, letterAssets, fetchInquiriesThread, userId, propClientName, logAction, addToast]);

  const sendToWebhookAndDeleteClient = useCallback(async () => {
      if(!window.confirm("Delete permanently?")) return;
      
      let deleteTargetName = propClientName;
      if (!deleteTargetName) {
          const { data: c } = await supabase.from("clients").select("full_name").eq("id", id).single();
          deleteTargetName = c?.full_name || "Client";
      }

      await supabase.storage.from(BUCKET).remove([`${id}/thread.json`]);
      await supabase.from("clients").delete().eq("id", id);
      
      await logAction({
         action: "delete_client",
         targetId: id,
         targetName: deleteTargetName,
         details: "Deleted client and associated thread."
      });

      addToast({ title: "Client Deleted", message: `${deleteTargetName} was permanently deleted.`, variant: "success", icon: "bi-trash3-fill" });
  }, [id, propClientName, logAction, addToast]);

  const markAllNonLinkedAsDeleted = useCallback(async (targetBureau = "All") => {
    const updatedInquiries = inquiries.map((item) => {
      let bFull = item.bureau;
      if(bFull === "EX") bFull = "Experian"; 
      if(bFull === "TU") bFull = "TransUnion"; 
      if(bFull === "EQ") bFull = "Equifax";

      const matchesBureau = targetBureau === "All" || bFull === targetBureau;

      if (matchesBureau && !isIgnoredStatus(item.classification) && normClass(item.classification) !== "deleted") {
        return { ...item, classification: "deleted" };
      }
      return item;
    });

    setInquiries(updatedInquiries);
    updateCounts_(updatedInquiries);

    const forceWebhook = targetBureau === "All";
    await saveUpdatedThread(updatedInquiries, forceWebhook);

  }, [inquiries, updateCounts_, saveUpdatedThread]);

  // "Mark [Bureau] N/A" — the self-healing counterpart to
  // markAllNonLinkedAsDeleted above. Reclassifies that bureau's remaining
  // actionable items (Non-Linked/Associated/Dispute) to "dnd" and saves
  // through the real classification engine, so exp_na/tu_na/eq_na is
  // DERIVED from classification (via computeBureauProgress) instead of a
  // direct flag flip that the next classification save would just reset
  // back to false the moment it noticed those items were never actually
  // reclassified. Already-deleted items are left alone — N/A and Deleted
  // are different outcomes, and a deleted item shouldn't be reclassified
  // away as "nothing to dispute here."
  const markAllNonLinkedAsDND = useCallback(async (targetBureau = "All") => {
    const updatedInquiries = inquiries.map((item) => {
      let bFull = item.bureau;
      if(bFull === "EX") bFull = "Experian";
      if(bFull === "TU") bFull = "TransUnion";
      if(bFull === "EQ") bFull = "Equifax";

      const matchesBureau = targetBureau === "All" || bFull === targetBureau;

      if (matchesBureau && !isIgnoredStatus(item.classification) && normClass(item.classification) !== "deleted") {
        return { ...item, classification: "dnd" };
      }
      return item;
    });

    setInquiries(updatedInquiries);
    updateCounts_(updatedInquiries);

    const forceWebhook = targetBureau === "All";
    await saveUpdatedThread(updatedInquiries, forceWebhook);

  }, [inquiries, updateCounts_, saveUpdatedThread]);

  const deletedCount = useMemo(() => inquiries.filter((i) => normClass(i.classification) === "deleted").length, [inquiries]);
  const nonLinkedCount = useMemo(() => inquiries.filter((i) => i.classification && !isIgnoredStatus(i.classification)).length, [inquiries]);
  const deletedRatioPct = useMemo(() => (nonLinkedCount > 0 ? Math.round((deletedCount / nonLinkedCount) * 100) : 0), [deletedCount, nonLinkedCount]);

  const filterInquiries = useCallback(() => inquiries.map((item, index) => ({ item, index })).filter(({ item }) => {
      if (activeTab === "All") return true;
      if (activeTab === "Linked") return normClass(item.classification) === "linked";
      if (activeTab === "Non-Linked") return ["non-linked", "dispute"].includes(normClass(item.classification));
      if (activeTab === "Deleted") return normClass(item.classification) === "deleted";
      if (activeTab === "Associated") return normClass(item.classification) === "associated";
      return item.bureau === activeTab;
  }), [inquiries, activeTab]);

  const filterAccounts = useCallback(() => accounts.map((a, idx) => ({ ...a, _realIndex: idx })).filter((a) => accountTab === "All" || a.type === accountTab), [accounts, accountTab]);
  
  const getTabCount = useCallback((tab) => {
      if (tab === "All") return inquiries.length;
      if (["Experian", "TransUnion", "Equifax"].includes(tab)) return inquiries.filter(i => i.bureau === tab).length;
      if (tab === "Linked") return inquiries.filter(i => normClass(i.classification) === "linked").length;
      if (tab === "Non-Linked") return inquiries.filter(i => ["non-linked", "dispute"].includes(normClass(i.classification))).length;
      if (tab === "Deleted") return inquiries.filter(i => normClass(i.classification) === "deleted").length;
      if (tab === "Associated") return inquiries.filter(i => normClass(i.classification) === "associated").length;
      return 0;
  }, [inquiries]);
  
  const getAccountTabCount = useCallback((tab) => {
      if (tab === "All") return accounts.length;
      return accounts.filter((a) => a.type === tab).length;
  }, [accounts]);

  const handleClassificationChange = useCallback((index, newClassification) => { setInquiries((prev) => { const u = [...prev]; u[index].classification = newClassification; return u; }); }, []);
  const handleAddInquiry = useCallback(() => { setInquiries((prev) => [...prev, { creditor: "New", bureau: "Experian", date: new Date().toLocaleDateString(), classification: "non-linked" }]); }, []);
  const handleDeleteInquiry = useCallback((index) => { if (window.confirm("Delete?")) setInquiries((prev) => prev.filter((_, i) => i !== index)); }, []);
  const handleAddAccount = useCallback(() => { setAccounts((prev) => [...prev, { creditor: "New", type: "revolving", dateOpened: new Date().toLocaleDateString(), openClosed: "Open" }]); }, []);
  const handleDeleteAccount = useCallback((index) => { if (window.confirm("Delete?")) setAccounts((prev) => prev.filter((_, i) => i !== index)); }, []);

  return { inquiries, setInquiries, accounts, setAccounts, counts, loading, saving, error, activeTab, setActiveTab, accountTab, setAccountTab, isGenerating, deletedCount, nonLinkedCount, deletedRatioPct, fetchInquiriesThread, saveUpdatedThread, generateDisputeLetters, sendToWebhookAndDeleteClient, filterInquiries, filterAccounts, getTabCount, getAccountTabCount, handleClassificationChange, handleAddInquiry, handleDeleteInquiry, handleAddAccount, handleDeleteAccount, markAllNonLinkedAsDeleted, markAllNonLinkedAsDND, approvedCounts };
}