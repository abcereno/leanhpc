// src/utils/opsMetrics.js
//
// Pure aggregation helpers for the Operations Dashboard. Kept separate from
// data-fetching (clientsData.js) and presentation (ops/*.jsx) so the
// definitions below are the one place "Active Client", "Files Processing",
// etc. are decided — reused by both the Company Snapshot cards and the
// Aging Dashboard.

import { getAgingBucket, AGING_BUCKETS } from "./aging";

// NOTE on "Action Required" counts: those are just specific keys out of
// utils/clientFlags.js's FILTER_DEFINITIONS (missing_documents,
// missing_payment, waiting_experian, waiting_tu, waiting_eq,
// internal_issues, count_reviews, authorization_holds, ready_to_complete).
// useOpsFilters() already computes a count per filter key (`filterCounts`)
// so the dashboard's Action Required section should read from that
// instead of a second parallel aggregation — keeps one definition of each
// bucket instead of two.

/**
 * Company Snapshot cards. Definitions:
 * - Active Clients: not yet fully done at the bureau level (bureausAllDone false)
 * - Active Partners: distinct companies with at least one active client
 * - Files Processing: paid AND still active (excludes unpaid leads)
 * - Ready to Complete: all bureaus done/N-A, but not yet formally closed (no date_completed)
 * - Completed (in range): date_completed falls within the given date range
 * - New Clients (in range): created_at falls within the given date range
 *
 * The first four are current-state counts ("right now"), so they ignore
 * `dateRange` entirely — only the last two are actually period-based, which
 * is also the only part of this function a date-range picker should affect.
 * `dateRange` is `{ from, to }` (YYYY-MM-DD strings, either side optional);
 * omit it (or pass `{}`) to get all-time totals for both.
 */
export function computeCompanySnapshot(clients, dateRange = {}) {
  const { from, to } = dateRange;
  const inRange = (isoString) => {
    if (!isoString) return false;
    const d = String(isoString).slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const activeClients = clients.filter((c) => !c.bureausAllDone);
  const activePartnerIds = new Set(
    activeClients.map((c) => c.company_id).filter(Boolean)
  );
  const filesProcessing = clients.filter((c) => c.is_paid && !c.bureausAllDone);
  // Gated on is_paid to match clientFlags.js's deriveClientFlags().readyToComplete
  // (the same "Ready to Complete" the Action Required panel and Production
  // Queue chip read) — an unpaid client can't be "ready to complete," only
  // paid ones can. These two counts must agree; this was the one place
  // still missing the check after that fix.
  const readyToComplete = clients.filter((c) => c.is_paid && c.bureausAllDone && !c.date_completed);

  const completedInRange = clients.filter((c) => inRange(c.date_completed));
  const newClientsInRange = clients.filter((c) => inRange(c.created_at));

  return {
    activePartners: activePartnerIds.size,
    activeClients: activeClients.length,
    filesProcessing: filesProcessing.length,
    readyToComplete: readyToComplete.length,
    completedInRange: completedInRange.length,
    newClientsInRange: newClientsInRange.length,
  };
}

/**
 * Buckets clients into the four aging bands.
 * mode "processing" -> paid, not-yet-done files, aged by business days since paid_at
 *   (i.e. "how long has this file been in production")
 * mode "unpaid" -> not-yet-paid clients, aged by business days since created_at
 *   (i.e. "how long has this lead been waiting on payment")
 */
export function bucketClientsByAging(clients, mode = "processing") {
  const buckets = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, []]));

  const scoped =
    mode === "unpaid"
      ? clients.filter((c) => !c.is_paid)
      : clients.filter((c) => c.is_paid && !c.bureausAllDone);

  scoped.forEach((c) => {
    const days = mode === "unpaid" ? c.createdRunningDays : c.paidRunningDays;
    const bucket = getAgingBucket(days);
    buckets[bucket.key].push({ ...c, agingDays: days });
  });

  return buckets;
}

/**
 * Per-partner rollup for the (internal, all-partners-at-once) Partner
 * Dashboard. Companies and affiliates are both "partners" in this schema
 * (clients.company_id / clients.affiliate_id), so this returns one
 * combined list with a `type` field rather than two separate shapes.
 */
export function computePartnerRollup(clients, companies, affiliates) {
  const rollupFor = (idField, partners, nameField, type) => {
    const byId = new Map(
      (partners || []).map((p) => [p.id, { id: p.id, name: p[nameField] || "—", type, activeClients: 0, waitingPayment: 0, processing: 0, completed: 0 }])
    );

    (clients || []).forEach((c) => {
      const pid = c[idField];
      if (!pid || !byId.has(pid)) return;
      const row = byId.get(pid);
      if (!c.bureausAllDone) row.activeClients += 1;
      if (!c.is_paid) row.waitingPayment += 1;
      if (c.is_paid && !c.bureausAllDone) row.processing += 1;
      if (c.date_completed) row.completed += 1;
    });

    return Array.from(byId.values());
  };

  const companyRows = rollupFor("company_id", companies, "company_name", "company");
  const affiliateRows = rollupFor("affiliate_id", affiliates, "affiliate_name", "affiliate");

  return [...companyRows, ...affiliateRows]
    .filter((r) => r.activeClients + r.waitingPayment + r.processing + r.completed > 0)
    .sort((a, b) => b.activeClients - a.activeClients);
}

/**
 * Single "Operations Health Score" (0-100, higher is better). Weighting is
 * a first-pass guess, not something Bernard specified — flagged in the
 * implementation plan as an open question. Easy to re-tune since every
 * input is an isolated, named penalty.
 */
export function computeHealthScore(clients) {
  const active = clients.filter((c) => !c.bureausAllDone);
  const total = active.length || 1;

  // Gated on is_paid to match clientFlags.js's over_30 predicate — an
  // unpaid lead sitting for 30 days is a payment problem, not a production
  // delay, and shouldn't drag the score down the same way a stalled paid
  // file does (this was still using the pre-fix, ungated definition).
  const overThirty = active.filter((c) => c.is_paid && (c.paidRunningDays ?? 0) >= 30).length;

  // Matches clientFlags.js's missingDocuments predicate — checks the real
  // cover-letter assets (license/SSN/POA via hasAllCoverLetterAssets), not
  // tu_eq_docs_submitted_at (a separate TU/EQ bureau-submission SLA step).
  const missingDocs = active.filter((c) => c.is_paid && !c.hasAllCoverLetterAssets).length;
  const internalIssues = active.filter((c) => (c.pendingTasksCount || 0) > 0).length;
  const unassigned = active.filter((c) => !c.admin_id).length;

  const paidActive = active.filter((c) => c.is_paid);
  const avgProcessingDays =
    paidActive.length > 0
      ? paidActive.reduce((sum, c) => sum + (c.paidRunningDays || 0), 0) / paidActive.length
      : 0;

  // Each penalty is a 0-25 point deduction, scaled by how bad the rate is.
  const pctPenalty = (count, cap = 25) => Math.min(cap, Math.round((count / total) * 100 * (cap / 100)));

  const penalties = {
    overThirtyDays: pctPenalty(overThirty),
    missingDocuments: pctPenalty(missingDocs),
    internalIssues: pctPenalty(internalIssues),
    unassignedFiles: pctPenalty(unassigned),
    slowProcessing: avgProcessingDays > 20 ? 25 : Math.round((avgProcessingDays / 20) * 25),
  };

  const totalPenalty = Object.values(penalties).reduce((sum, p) => sum + p, 0);
  const score = Math.max(0, 100 - totalPenalty);

  return { score, penalties, avgProcessingDays: Math.round(avgProcessingDays * 10) / 10 };
}
