// src/utils/clientFlags.js
//
// Per-client status flags + the shared filter registry used by "Action
// Required" counts, filter chips, and the Production Queue's status/action
// badges. Keeping the definitions in one place means the dashboard's counts
// and a filtered list always agree on what e.g. "Waiting Experian" means.
//
// authorizationHold is still a stub (see comment below) — its backing table
// doesn't exist yet (Priority 1). countReviewPending (Priority 2) is real —
// see clientsData.js's count_review_requests bulk fetch.

import { SERVICES, resolveServiceId } from "./services";
import { AGING_BUCKETS } from "./aging";
import { PIPELINE_STAGES, EXP_PIPELINE_STAGES, TUEQ_PIPELINE_STAGES, pipelineBucketForExp, pipelineBucketForTuEq } from "./workflowStage";

/**
 * Computes derived status flags for a single enriched client row (as
 * produced by utils/clientsData.js#enrichClientRows).
 */
export function deriveClientFlags(client) {
  const isPaid = !!client.is_paid;

  return {
    missingPayment: !isPaid,

    // "Missing Documents" = the actual cover-letter assets (license, SSN,
    // POA) aren't all uploaded yet for a paid client. Checked directly
    // against client_documents (see clientsData.js#fetchEnrichedClients,
    // which bulk-fetches which of the three file_name keys exist per
    // client into hasAllCoverLetterAssets) rather than any cached boolean —
    // deliberately NOT using tu_eq_docs_submitted_at, which is a separate
    // TU/EQ bureau-submission SLA step (ClientHeaderActions.jsx), not an
    // asset-presence signal.
    missingDocuments: isPaid && !client.hasAllCoverLetterAssets && !client.date_completed,

    // AI validity check (sql/add_document_validation.sql) flagged the
    // license, SSN card, or POA as expired/invalid/needs_review — see
    // clientsData.js#fetchEnrichedClients' client_documents bulk fetch for
    // hasDocIssue. Deliberately separate from missingDocuments: a client
    // can have all 3 files present (missingDocuments = false) but one of
    // them still be expired or unreadable, which is exactly the case
    // staff asked not to miss. Warning-only, same as every other flag
    // here — never blocks routing_status or anything downstream.
    docIssue: isPaid && !!client.hasDocIssue && !client.date_completed,

    waitingExperian: isPaid && !client.exp_completed && !client.exp_na,
    waitingTransUnion: isPaid && !client.tu_completed && !client.tu_na,
    waitingEquifax: isPaid && !client.eq_completed && !client.eq_na,

    // No dedicated "internal issue" column exists in the schema. Using
    // open (incomplete) company_tasks as the closest existing proxy —
    // revisit this definition once/if Bernard defines "Internal Issues"
    // more precisely.
    internalIssue: (client.pendingTasksCount || 0) > 0,

    readyToComplete: isPaid && !!client.bureausAllDone && !client.date_completed,
    completed: isPaid && !!client.date_completed,

    // "Active" = currently in production: paid, and not yet formally
    // closed. Deliberately does NOT also require !bureausAllDone — a
    // readyToComplete file (all bureaus done, not yet closed) is still
    // "active" in the sense the user means here (paid, not completed).
    active: isPaid && !client.date_completed,

    // Priority 1 (Authorization Protection) — real now. True when any
    // bureau has a pending count_review_request whose disputable count has
    // grown past an already-established approved_{bureau}_count (see
    // utils/authorizationHold.js and sql/add_authorization_overrides.sql).
    // clientsData.js#fetchEnrichedClients computes hasAuthorizationHold
    // per client from the bulk count_review_requests fetch.
    authorizationHold: !!client.hasAuthorizationHold,

    // Priority 2 (AI Count Quality Control) — real now: true when a
    // non-approver's saveUpdatedThread() save opened a pending row in
    // count_review_requests for this client (see clientsData.js's bulk
    // fetch and CountReviewQueue.jsx, which is where it gets resolved).
    countReviewPending: !!client.hasPendingCountReview,
  };
}

/**
 * Shared filter registry: [{ key, label, emoji, predicate(client, ctx) }].
 * `ctx` currently only carries `{ userId }` for the "My Files" filter, but
 * is passed through so future filters (e.g. role-scoped ones) don't need a
 * different calling convention.
 *
 * NOTE: predicates assume `client` already has `.flags` attached (see
 * attachFlags() below) and the aging fields from enrichClientRows().
 */
// active/over_15/over_20/over_30 map 1:1 onto utils/aging.js#AGING_BUCKETS
// (the same 0–14/15–19/20–29/30+ bands used for each card's colored aging
// dot and by ProductionQueue.jsx's CHIP_BUCKET_BY_KEY for chip coloring) —
// pulling min/max and the label straight from there instead of
// re-hardcoding the boundaries is what actually keeps them in sync, since
// CHIP_BUCKET_BY_KEY already assumed (for styling) that these 4 chips were
// exact, non-overlapping ranges. They used to be cumulative ">= N days"
// thresholds instead, which LOOKED like 4 distinct buckets (different
// colors) but actually put the same client in 2 or 3 chips at once — e.g. a
// client at 35 days matched "Over 15", "Over 20," AND "Over 30"
// simultaneously. Clicking any one of those chips showed a mix of clients
// that also belonged in the others. Each chip is now an exact band —
// clicking "20–29 Days" shows only clients in that band, never 30+ mixed
// in.
const [ACTIVE_BUCKET, D15_19_BUCKET, D20_29_BUCKET, D30PLUS_BUCKET] = AGING_BUCKETS;
const inAgingBand = (client, bucket) => {
  const days = client.agingDaysCurrent ?? 0;
  return days >= bucket.min && days <= bucket.max;
};

export const FILTER_DEFINITIONS = [
  // Gated on is_paid: agingDaysCurrent measures paidRunningDays for paid
  // clients but createdRunningDays (time spent unpaid) for unpaid ones (see
  // utils/aging.js#getCurrentAgingDays) — an unpaid lead sitting for 20 days
  // isn't a "file 20 days into production," it's a payment problem. Unpaid
  // clients should only ever surface via "Missing Payment" below, never
  // these production-aging buckets — same reasoning already applied to
  // missingDocuments/waitingExperian/etc.
  //
  // Also excludes closed files (date_completed set): paidRunningDays
  // freezes at date_completed (see clientsData.js#enrichClientRows), so
  // without this a client that took 45 days to finish and was closed out
  // months ago would count toward "30+ Days" forever — it never ages out.
  // "Ready to Complete" stays its own separate bucket below (that one
  // *should* keep surfacing — a bureausAllDone file nobody has formally
  // closed still needs someone to act on it).
  { key: "my_files", label: "My Files", predicate: (c, ctx) => c.admin_id === ctx?.userId },
  { key: "active", label: `Active (${ACTIVE_BUCKET.label})`, predicate: (c) => c.is_paid && !c.date_completed && inAgingBand(c, ACTIVE_BUCKET) },
  { key: "over_15", label: D15_19_BUCKET.label, predicate: (c) => c.is_paid && !c.date_completed && inAgingBand(c, D15_19_BUCKET) },
  { key: "over_20", label: D20_29_BUCKET.label, predicate: (c) => c.is_paid && !c.date_completed && inAgingBand(c, D20_29_BUCKET) },
  { key: "over_30", label: D30PLUS_BUCKET.label, predicate: (c) => c.is_paid && !c.date_completed && inAgingBand(c, D30PLUS_BUCKET) },
  { key: "paused", label: "Paused", predicate: (c) => !!c.is_paused },
  // One chip per service (Inquiry Deletion, Case Management, Fraud Alert
  // Removal, Personal Identifiers) generated from the shared SERVICES list
  // instead of hardcoded one-off entries — so a 5th service added later
  // (utils/services.js + sql/add_services.sql) gets a filter chip here for
  // free. Keyed by service id (e.g. "credit_repair") rather than the raw
  // dispute_method string, matched via resolveServiceId so casing-
  // inconsistent or not-yet-backfilled rows still match correctly.
  ...SERVICES.map((s) => ({
    key: `service_${s.id}`,
    label: s.label,
    predicate: (c) => resolveServiceId(c) === s.id,
  })),
  { key: "missing_documents", label: "Missing Documents", predicate: (c) => c.flags.missingDocuments },
  { key: "doc_issues", label: "Document Issues", predicate: (c) => c.flags.docIssue },
  { key: "missing_payment", label: "Missing Payment", predicate: (c) => c.flags.missingPayment },
  { key: "waiting_experian", label: "Waiting Experian", predicate: (c) => c.flags.waitingExperian },
  { key: "waiting_tu", label: "Waiting TU", predicate: (c) => c.flags.waitingTransUnion },
  { key: "waiting_eq", label: "Waiting EQ", predicate: (c) => c.flags.waitingEquifax },
  { key: "internal_issues", label: "Internal Issues", predicate: (c) => c.flags.internalIssue },
  { key: "authorization_holds", label: "Authorization Holds", predicate: (c) => c.flags.authorizationHold },
  { key: "count_reviews", label: "Count Review Requests", predicate: (c) => c.flags.countReviewPending },
  { key: "ready_to_complete", label: "Ready to Complete", predicate: (c) => c.flags.readyToComplete },
  { key: "completed", label: "Completed", predicate: (c) => c.flags.completed },

  // Pipeline dashboard drill-down (AdminDashboard.jsx's "Pipeline" tab,
  // utils/workflowStage.js#summarizePipeline) — deliberately excluded from
  // ProductionQueue.jsx's visible chip row (see its EXCLUDED_KEYS) since
  // these chips would clutter that bar — reached by clicking a Pipeline
  // stage, not by browsing chips.
  //
  // `pipeline_all_*` is the merged view WorkflowPipeline.jsx actually
  // shows now (EXP no longer gets its own row — it runs the identical
  // docs-round/7-day-wait cycle TU/EQ does): a client matches if EITHER
  // lane is sitting in that stage, counted once even if both are — the
  // exact same "either lane" union summarizePipeline's `all` counts use,
  // so a tile's number always matches its drill-down list length.
  ...PIPELINE_STAGES.map((s) => ({
    key: `pipeline_all_${s.key}`,
    label: s.label,
    predicate: (c) => pipelineBucketForExp(c) === s.key || pipelineBucketForTuEq(c) === s.key,
  })),
  // `pipeline_exp_*`/`pipeline_tueq_*` — the individual per-bureau
  // breakdown behind that merged view, kept in case anything ever wants
  // just EXP's or just TU/EQ's count on its own again.
  ...EXP_PIPELINE_STAGES.map((s) => ({
    key: `pipeline_exp_${s.key}`,
    label: `EXP — ${s.label}`,
    predicate: (c) => pipelineBucketForExp(c) === s.key,
  })),
  ...TUEQ_PIPELINE_STAGES.map((s) => ({
    key: `pipeline_tueq_${s.key}`,
    label: `TU/EQ — ${s.label}`,
    predicate: (c) => pipelineBucketForTuEq(c) === s.key,
  })),
];

/**
 * Attaches `.flags` and `.agingDaysCurrent` to every client in the list.
 * Call this once after loading clients (e.g. in useOpsSummary or a
 * page-level useMemo) so both the filter registry and any component can
 * read `client.flags.*` / `client.agingDaysCurrent` directly.
 */
export function attachFlags(clients, getCurrentAgingDays) {
  return clients.map((c) => ({
    ...c,
    flags: deriveClientFlags(c),
    agingDaysCurrent: getCurrentAgingDays(c),
  }));
}
