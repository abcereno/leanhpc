import { useCallback } from "react";
import { supabase } from "../supabaseClient";
import { useToast } from "../components/shared/ui/ToastNotifier";
import { useConfirm } from "../components/shared/ui/ConfirmDialog";
import { markClientPaid } from "../utils/markClientPaid";
import { computeWeightedProgress } from "../utils/progressWeighting";

export function useClientActions(clientId, client, refetch, onRefresh) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();

  const ok  = (msg) => addToast({ title: "Success", message: msg, variant: "success", icon: "bi-check-circle" });
  const err = (msg) => addToast({ title: "Error",   message: msg, variant: "danger",  icon: "bi-exclamation-triangle" });
  const reload = async () => { await refetch(); if (onRefresh) onRefresh(); };

  const update = useCallback(async (data, okMsg, skipConfirm = false) => {
    if (!skipConfirm && !(await confirm("Are you sure you want to perform this action?"))) return;
    const { error: e } = await supabase.from("clients").update(data).eq("id", clientId);
    if (e) { err(`Failed to update: ${e.message}`); return false; }
    await reload();
    if (okMsg) ok(okMsg);
    return true;
  }, [clientId, refetch, onRefresh, confirm]); // eslint-disable-line

  // --- Status Actions ---
  // Actual logic lives in utils/markClientPaid.js — shared with the admin
  // "New Client Leads" page (AdminNewLeads.jsx), which needs to mark many
  // different clients paid from a list rather than one client's own profile
  // hook. Keeping one implementation means both places reset bureau
  // statuses, create the Document Routing round, and fire the payment
  // webhooks identically — a client marked paid any other way (e.g. a plain
  // `.update({is_paid:true})`) silently skips all of that.
  // `amount` is required — the confirmation + amount entry now happens in
  // MarkPaidAmountModal.jsx (opened from ClientHeader.jsx's Status
  // dropdown) rather than a window.confirm here, since markClientPaid.js
  // needs a real amount to auto-record the payment as income.
  const markAsPaid = async (amount) => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      err("Enter a valid amount before marking this client paid.");
      return false;
    }
    const { error: e } = await markClientPaid(clientId, client, { amount: numericAmount });
    if (e) { err("Failed to mark as paid: " + e.message); return false; }
    await reload();
    ok("Client marked as paid.");
    return true;
  };

  // Pausing requires a reason (sql/add_pause_reason.sql's clients.pause_reason)
  // — unlike the Operational Timeline's gap-reason notes (admin-only, see
  // ClientSummaryModal.jsx's showGapReasons), this one is meant to be
  // visible on the client's company/broker portal summary too, so partners
  // can see why progress stopped without having to ask. Left in place on
  // resume rather than cleared, so it still reads as "last paused because
  // X" afterward — a later pause just overwrites it with the new reason.
  const togglePause = async () => {
    const isPausing = !client.is_paused;

    let reason = null;
    if (isPausing) {
      reason = await confirm({
        title: "Pause Service",
        message: `Pause service for ${client.full_name || "this client"}? The reason below will show on their company/partner portal summary until service resumes.`,
        confirmText: "Pause Service",
        variant: "warning",
        requireReason: true,
        reasonLabel: "Reason for pausing",
        reasonPlaceholder: "e.g. Waiting on ID/SSN documents from client",
      });
      if (!reason) return;
    } else {
      const confirmed = await confirm({
        title: "Resume Service",
        message: `Resume service for ${client.full_name || "this client"}?`,
        confirmText: "Resume Service",
        variant: "success",
      });
      if (!confirmed) return;
    }

    const data = isPausing
      ? { is_paused: true, paused_at: new Date().toISOString(), pause_reason: reason }
      : {
          is_paused: false,
          paused_days_total: (client.paused_days_total || 0) + Math.floor((Date.now() - new Date(client.paused_at)) / 86_400_000),
          paused_at: null,
        };

    const { error: e } = await supabase.from("clients").update(data).eq("id", clientId);
    if (e) { err(`Failed to update pause status: ${e.message}`); return; }
    await reload();
    ok(`Service ${isPausing ? "paused" : "resumed"}.`);
  };

  const toggleDispute = async () => {
    const next = !client.dont_dispute;
    if (!(await confirm(`Mark as ${next ? "Do Not Dispute" : "OK to dispute"}?`))) return;
    const { error: e } = await supabase.from("clients").update({ dont_dispute: next }).eq("id", clientId);
    if (e) { err("Failed to update: " + e.message); return; }
    await reload();
    ok(`Client marked as ${next ? "Do Not Dispute" : "OK to dispute"}.`);
  };

  const toggleInquiriesLock = () =>
    update({ inquiries_locked: !client.inquiries_locked }, `Inquiries are now ${!client.inquiries_locked ? "LOCKED" : "UNLOCKED"}.`);

  // --- Bureau Actions ---
  // Per-bureau "Complete"/"N/A" used to live here as direct flag flips
  // (markExperianComplete, markEquifaxNA, etc.) independent of the actual
  // classification data — which meant the very next classification save
  // (by anyone, through any path) would recompute exp_completed/exp_na
  // from what's actually classified and silently reset these direct writes
  // back, since nothing here ever touched the underlying thread.json.
  // That's now handled by ClientHeader.jsx's runBureauComplete/runBureauNA,
  // which reclassify the bureau's remaining items (to Deleted or
  // Do-Not-Dispute respectively) and save through
  // useInquiriesThread.js#markAllNonLinkedAsDeleted /
  // #markAllNonLinkedAsDND — so completed/na is always derived from real
  // classification (see utils/inquiryCounts.js#computeBureauProgress) and
  // can't drift out of sync with it again.
  //
  // Fraud Alert Removal / Personal Identifiers (see utils/services.js) are
  // still worked bureau-by-bureau in practice (the alert/update is removed
  // per bureau, not all at once) but never dispute inquiries — there's no
  // thread.json classification for these services to derive exp/tu/eq
  // completed/na from, so a direct flag flip here is the correct behavior
  // for them (not the bug it would be for Inquiry Deletion/Credit Repair —
  // nothing else will ever recompute and overwrite these two fields for a
  // non-classified service). See ClientHeader.jsx's isDirectBureauService /
  // runDirectBureauComplete/runDirectBureauNA for the calling side.
  // Fraud Alert Removal / Personal Identifiers have no classification
  // engine behind them (see comment above), so nothing else ever
  // recomputes `progress` for them the way inquiryCounts.js#
  // computeBureauProgress does for Inquiry Deletion/Credit Repair —
  // without this, a client fully resolved on all 3 bureaus via the direct
  // flag flips below would still read progress: 0 everywhere partners see
  // it (ServiceClientList.jsx's progress bar/percentage), even though
  // they're actually done. Deriving it here from the same exp/tu/eq
  // completed-or-na state (1 of 3 bureaus resolved = 33%, all 3 = 100%)
  // keeps it self-correcting instead of a separate flag that could drift.
  // This is now the "outcome_ratio" input to the weighted progress formula
  // (see utils/progressWeighting.js) for FAR/PI, not `progress` itself —
  // `progress` is the blend of this + docs/calls credit, computed below.
  const directBureauProgress = (data) => {
    const merged = { ...client, ...data };
    const resolved = ["exp", "tu", "eq"].filter((b) => merged[`${b}_completed`] || merged[`${b}_na`]).length;
    return resolved / 3;
  };

  // outcome_ratio is written in a separate, isolated call AFTER the real
  // bureau-flag update succeeds — same reasoning as useInquiriesThread.js's
  // dbPayload comment: sql/add_outcome_ratio.sql might not be run yet, and
  // that one optional column should never be able to block the actual
  // Complete/N-A action (exp/tu/eq_completed/_na) from saving.
  const saveOutcomeRatio = async (outcomeRatio) => {
    try {
      const { error } = await supabase.from("clients").update({ outcome_ratio: outcomeRatio }).eq("id", clientId);
      if (error) console.warn("Could not save outcome_ratio (run sql/add_outcome_ratio.sql if it doesn't exist yet):", error.message);
    } catch (e) {
      console.warn("Could not save outcome_ratio:", e);
    }
  };

  const markBureauComplete = async (bureau) => {
    const data = bureau === "all"
      ? { exp_completed: true, exp_na: false, tu_completed: true, tu_na: false, eq_completed: true, eq_na: false }
      : { [`${bureau}_completed`]: true, [`${bureau}_na`]: false };
    const outcomeRatio = directBureauProgress(data);
    const weightedProgress = await computeWeightedProgress(clientId, outcomeRatio);
    const ok = await update({ ...data, progress: weightedProgress }, null, true);
    if (ok) await saveOutcomeRatio(outcomeRatio);
    return ok;
  };

  const markBureauNA = async (bureau) => {
    const data = bureau === "all"
      ? { exp_na: true, exp_completed: false, tu_na: true, tu_completed: false, eq_na: true, eq_completed: false }
      : { [`${bureau}_na`]: true, [`${bureau}_completed`]: false };
    const outcomeRatio = directBureauProgress(data);
    const weightedProgress = await computeWeightedProgress(clientId, outcomeRatio);
    const ok = await update({ ...data, progress: weightedProgress }, null, true);
    if (ok) await saveOutcomeRatio(outcomeRatio);
    return ok;
  };

  const updateStartDateToToday  = () => update({ start_date: new Date().toISOString().split("T")[0] }, "Start date updated to today.");

  // Services that don't work bureau-by-bureau at all (none currently — both
  // remaining non-inquiry services, Fraud Alert Removal and Personal
  // Identifiers, are handled per-bureau above) would use this instead:
  // closes the file directly by setting date_completed (the actual
  // "completed" signal clientFlags.js#deriveClientFlags reads) and progress
  // to 100%. Kept for any future service added without per-bureau tracking.
  const markServiceComplete = () =>
    update({ date_completed: new Date().toISOString(), progress: 1.0 }, "Client marked as complete.");

  return {
    markAsPaid, togglePause, toggleDispute, toggleInquiriesLock,
    updateStartDateToToday,
    markBureauComplete, markBureauNA,
    markServiceComplete,
  };
}