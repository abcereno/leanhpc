// src/utils/workflowStage.js
//
// Derives "where is this client right now" from the Document Routing / Call
// Routing pipeline — so Production Queue (and eventually the client
// profile) can show it without a manager having to open /docs-routing or
// /call-routing separately.
//
// Experian, TransUnion, and Equifax all share the same document_routing
// round cycle now (callable 7 days after that round's docs were created,
// and only once FTC/CFPB/that bureau's own "submitted" checkbox are all
// checked) — see sql/gate_exp_calls_on_docs_round.sql, which auto-queues
// the actual call_routing rows for all three. EXP used to be its own
// independent, always-ready-immediately-on-payment track (no docs wait at
// all); that changed per the client's explicit ask to bring it in line
// with TU/EQ. This file just renders whatever state that self-healing
// sync (or the manual "Send to Call Queue" button) has produced, plus the
// "ready but not queued yet" and "still waiting out the 7 days" states for
// the gap between eligibility and the next sync pass.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Shared styling for every stage badge/tile drawn from this file's `type`
// values (docs/calls/ready/waiting/completed) — used by ProductionQueue.jsx
// (per-client badges), ProductionQueueLegend.jsx (the tag-guide preview),
// and WorkflowPipeline.jsx (the aggregate stage counts), so all three always
// agree on what color/icon each stage is instead of three copies drifting
// apart.
//
// `hex` is a fixed color for anything rendered as plain text/borders on a
// light card background (WorkflowPipeline.jsx's stage tiles) — deliberately
// NOT a Bootstrap `text-*`/`var(--bs-*)` reference. This app's dark-mode
// toggle (ThemeContext.jsx) sets `data-bs-theme="dark"` on <body>, which
// makes Bootstrap re-map those to light colors meant for dark backgrounds
// — fine for the `<Badge>` components elsewhere (they compute their own
// contrasting text against their own fill), but on a plain white tile
// that turned "calls" (text-dark) into pale, barely-readable text even
// when the count wasn't zero. `hex` sidesteps that entirely.
// `darkHex` is the same idea as `hex`, tuned instead for the dark card
// backgrounds ClientCardGrid.jsx renders on (Production Queue / Pipeline
// drill-down) when dark mode is on — `hex`'s near-black "calls" color
// would be invisible there, so this is a separate, brighter palette rather
// than one color trying to work on both a light tile and a dark card.
export const STAGE_BADGE_STYLE = {
  docs: { bg: "primary", icon: "bi-file-earmark-text-fill", hex: "#0d6efd", darkHex: "#74c0fc" },
  calls: { bg: "dark", icon: "bi-telephone-fill", hex: "#212529", darkHex: "#ffd43b" },
  ready: { bg: "success", icon: "bi-telephone-forward-fill", hex: "#198754", darkHex: "#69db7c" },
  waiting: { bg: "secondary", icon: "bi-hourglass-split", hex: "#6c757d", darkHex: "#ced4da" },
  completed: { bg: "success", icon: "bi-check-circle-fill", hex: "#198754", darkHex: "#69db7c" },
};

// Overdue overrides whatever color the stage's `type` would otherwise get
// — same reasoning, a bright red that reads clearly on a dark card.
export const OVERDUE_DARK_HEX = "#ff6b6b";

function bureauStatusLine(exp_status, tu_status, eq_status) {
  return `EXP: ${exp_status || "NEW"} · TU: ${tu_status || "NEW"} · EQ: ${eq_status || "NEW"}`;
}

// "Aug 4" — short enough to fit inline in a one-line instruction, no time
// component needed (a due *date*, not a due *moment*).
function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Plain-English "what do I actually do for this client" text — this is
// the line ClientCardGrid.jsx renders under the stage badges. Admins asked
// for this specifically because the badges/tooltips above ("TU/EQ — Docs
// R2", a hover tooltip) still required knowing what the system means by
// that; these strings are meant to need zero translation — a person who's
// never seen this screen before should know exactly what to do.
function callInstruction(bureauLabel, assignee, dueDate) {
  const due = fmtDate(dueDate);
  if (assignee && due) return `Call ${bureauLabel} now — ${assignee}, due ${due}`;
  if (assignee) return `Call ${bureauLabel} now — ${assignee}`;
  return `Call ${bureauLabel} now — unassigned`;
}

/**
 * Shared "docs round → 7-day wait → ready → calls" state machine — EXP,
 * TU, and EQ all follow this same cycle now (see
 * sql/gate_exp_calls_on_docs_round.sql), sharing the same document_routing
 * round/timer and differing only in which bureau(s) this lane covers and
 * which per-bureau "submitted" checkbox(es) gate it. Returns null when
 * there's nothing worth showing (lane already fully done, or not paid).
 *
 * `label` — "EXP" or "TU/EQ", used in every string below.
 * `isDone` — true once every bureau this lane covers is completed/N-A.
 * `activeCall` — the pending call_routing row for this lane, if any
 *   (already resolved by the caller from pendingCalls, since EXP only
 *   ever has one candidate slot while TU/EQ picks whichever of two is
 *   active — see the two thin wrappers below).
 * `bureauSubmitted(docTask)` — true once every bureau this lane covers has
 *   its own "submitted" checkbox checked on the shared doc round.
 */
function computeDocsGatedStage({
  label,
  isPaid,
  isDone,
  activeCall,
  pendingDocTask,
  latestDocTask,
  docRoundMax,
  bureauSubmitted,
}) {
  if (isDone) return null;
  if (!isPaid) return null;

  if (activeCall) {
    const round = activeCall.round_count ?? latestDocTask?.round_count ?? 1;
    const assignee = activeCall.assignedAdminName || null;
    const dueDate = activeCall.scheduled_date || null;
    return {
      type: "calls",
      label: `${label} — Call R${round}`,
      tooltip: `Queued in Call Routing${activeCall.scheduled_date ? ` for ${activeCall.scheduled_date}` : ""}.`,
      // Who's actually on the hook for this call, and by when — see
      // clientsData.js's assignedAdminName resolution. Null until someone
      // picks it up in Call Routing.
      assignee,
      dueDate,
      nextAction: callInstruction(label, assignee, dueDate),
    };
  }

  if (pendingDocTask) {
    // The call only auto-queues once FTC, CFPB, and this lane's bureau
    // "submitted" checkbox(es) are ALL checked, on top of the 7-day wait
    // (see sql/gate_exp_calls_on_docs_round.sql). A round that's fully
    // submitted still shows "waiting"/"ready" below (same as a round with
    // no PENDING row at all) — document_routing rows stay status=PENDING
    // even after the self-healing sync auto-queues a call for them (that
    // function only inserts into call_routing, it never updates
    // document_routing), so checking `pendingDocTask` alone and
    // unconditionally calling it "docs" would make "waiting"/"ready"
    // effectively unreachable: a fully-submitted, sub-7-day-old round
    // would show as "still needs docs" right up until the moment it
    // jumps straight to "calls", with the countdown state never shown in
    // between. Only a round that ISN'T fully submitted yet stays "docs"
    // here — that's the actionable "still needs FTC/CFPB/bureau checkbox"
    // bucket; `overdue` flags one that's also past 7 days with nothing
    // checked off, since there'd be nothing to call about otherwise.
    const ageMs = pendingDocTask.created_at ? Date.now() - new Date(pendingDocTask.created_at).getTime() : 0;
    const fullySubmitted = !!(pendingDocTask.ftc_completed && pendingDocTask.cfpb_completed && bureauSubmitted(pendingDocTask));

    if (!fullySubmitted) {
      const overdue = ageMs >= SEVEN_DAYS_MS;
      const assignee = pendingDocTask.assignedAdminName || null;
      return {
        type: "docs",
        label: `${label} — Docs R${pendingDocTask.round_count}`,
        tooltip: overdue
          ? `Past 7 days and still not fully submitted (FTC, CFPB, and ${label}'s bureau checkbox) — the ${label} call won't auto-queue until this round is complete.`
          : `In the Document Routing queue. The ${label} call auto-queues 7 days after this round was created, once FTC, CFPB, and ${label}'s bureau checkbox are submitted.`,
        assignee,
        overdue,
        nextAction: overdue
          ? `Docs overdue for ${label} R${pendingDocTask.round_count} — finish FTC/CFPB/bureau checkboxes`
          : `Need docs for ${label} R${pendingDocTask.round_count}${assignee ? ` — ${assignee}` : " — unassigned"}`,
      };
    }

    if (ageMs >= SEVEN_DAYS_MS) {
      return {
        type: "ready",
        label: `${label} — Ready to Call`,
        tooltip: "Fully submitted and the 7-day docs window has passed. Auto-queues into Call Routing on the next sync.",
        nextAction: `${label} ready to call — queuing automatically`,
      };
    }
    const daysLeftPending = Math.max(1, Math.ceil((SEVEN_DAYS_MS - ageMs) / (24 * 60 * 60 * 1000)));
    return {
      type: "waiting",
      label: `${label} — R${pendingDocTask.round_count} (${daysLeftPending}d to call)`,
      tooltip: `Fully submitted — waiting out the 7-day docs window before ${label} can be called — started ${pendingDocTask.created_at?.slice(0, 10)}.`,
      nextAction: `Docs submitted — ${label} call in ${daysLeftPending}d`,
    };
  }

  if (latestDocTask?.created_at) {
    const elapsedMs = Date.now() - new Date(latestDocTask.created_at).getTime();
    if (elapsedMs >= SEVEN_DAYS_MS) {
      return {
        type: "ready",
        label: `${label} — Ready to Call`,
        tooltip: "The 7-day docs window has passed. Auto-queues into Call Routing on the next sync.",
        nextAction: `${label} ready to call — queuing automatically`,
      };
    }
    const daysLeft = Math.max(1, Math.ceil((SEVEN_DAYS_MS - elapsedMs) / (24 * 60 * 60 * 1000)));
    return {
      type: "waiting",
      label: `${label} — R${latestDocTask.round_count} (${daysLeft}d to call)`,
      tooltip: `Waiting out the 7-day docs window before ${label} can be called — started ${latestDocTask.created_at.slice(0, 10)}.`,
      nextAction: `Docs submitted — ${label} call in ${daysLeft}d`,
    };
  }

  // Paid, not done, no docs round exists yet at all — matches
  // DocumentRouting.jsx's own "virtual" draft-task behavior.
  const nextRound = (docRoundMax || 0) + 1;
  return {
    type: "docs",
    label: `${label} — Docs R${nextRound}`,
    tooltip: "Not yet queued — will auto-appear in Document Routing.",
    nextAction: `Need docs round created for ${label}`,
  };
}

/**
 * Experian's lane: same shared docs round as TU/EQ, gated on its own
 * exp_submitted checkbox. Returns null when there's nothing worth showing
 * (not paid yet, or EXP already done).
 */
function computeExpStage({ is_paid, exp_completed, exp_na, pendingCalls, pendingDocTask, latestDocTask, docRoundMax }) {
  return computeDocsGatedStage({
    label: "EXP",
    isPaid: is_paid,
    isDone: exp_completed || exp_na,
    activeCall: pendingCalls?.exp || pendingCalls?.legacy,
    pendingDocTask,
    latestDocTask,
    docRoundMax,
    bureauSubmitted: (docTask) => !!docTask?.exp_submitted,
  });
}

/**
 * TU/EQ's lane: shared docs round, 7-day wait from that round's created_at.
 * Returns null when there's nothing left to do (both TU and EQ already
 * done/N-A) or nothing to show yet (not paid).
 */
function computeTuEqStage({
  is_paid,
  tu_completed,
  tu_na,
  eq_completed,
  eq_na,
  pendingCalls,
  pendingDocTask,
  latestDocTask,
  docRoundMax,
}) {
  const tuDone = tu_completed || tu_na;
  const eqDone = eq_completed || eq_na;
  return computeDocsGatedStage({
    label: "TU/EQ",
    isPaid: is_paid,
    isDone: tuDone && eqDone,
    activeCall: pendingCalls?.tu || pendingCalls?.eq || pendingCalls?.legacy,
    pendingDocTask,
    latestDocTask,
    docRoundMax,
    // TU and EQ can have different assignees/timing (two separate
    // call_routing rows), but this combined badge can only show one
    // "fully submitted" state for the shared round — matches the existing
    // "both must be submitted" bar this lane always used.
    bureauSubmitted: (docTask) => !!(docTask?.tu_submitted && docTask?.eq_submitted),
  });
}

/**
 * Returns `{ exp, tuEq, completed }`:
 *  - `completed` is a single shared stage when EVERY bureau is done/N-A
 *    (nothing left to split into two lanes).
 *  - otherwise `exp` and/or `tuEq` carry that lane's current stage (each
 *    possibly null if there's nothing to show for that lane specifically).
 */
export function computeWorkflowStage(client) {
  const {
    is_paid,
    exp_completed,
    exp_na,
    tu_completed,
    tu_na,
    eq_completed,
    eq_na,
    exp_status,
    tu_status,
    eq_status,
  } = client;

  const bureausAllDone =
    (exp_completed || exp_na) && (tu_completed || tu_na) && (eq_completed || eq_na);

  if (bureausAllDone) {
    return {
      completed: { type: "completed", label: "Completed", tooltip: `All bureaus completed or N/A. ${bureauStatusLine(exp_status, tu_status, eq_status)}` },
      exp: null,
      tuEq: null,
    };
  }

  return {
    completed: null,
    exp: computeExpStage(client),
    tuEq: computeTuEqStage(client),
  };
}

// --- Pipeline dashboard (aggregate, fleet-wide view) --------------------
//
// Everything below buckets a client into a single named stage per lane
// (rather than the tooltip-carrying stage objects above) so
// AdminDashboard.jsx's Pipeline tab can show "N clients sitting here"
// counts across the whole client list. Deliberately reuses is_paid/
// exp_completed/exp_na/etc. and workflowStage.exp/tuEq directly rather
// than re-deriving new logic, so the pipeline counts can never disagree
// with the per-client stage badges Production Queue already shows for
// the same client.
// EXP now shares the exact same docs-round → 7-day-wait → ready → calls
// cycle as TU/EQ (see computeDocsGatedStage above), so there's only one
// stage list — EXP_PIPELINE_STAGES/TUEQ_PIPELINE_STAGES used to be two
// separately-declared-but-identical-in-shape arrays back when EXP's lane
// was shorter; now they're literally the same list, kept as two exported
// names only because clientFlags.js's per-lane pipeline_exp_*/
// pipeline_tueq_* filters still read them separately.
export const PIPELINE_STAGES = [
  { key: "unpaid", label: "Unpaid", type: "waiting" },
  { key: "docs", label: "Docs Round", type: "docs" },
  { key: "waiting", label: "7-Day Wait", type: "waiting" },
  { key: "ready", label: "Ready to Call", type: "ready" },
  { key: "calls", label: "In Call Queue", type: "calls" },
  { key: "completed", label: "Completed / N-A", type: "completed" },
];
export const EXP_PIPELINE_STAGES = PIPELINE_STAGES;
export const TUEQ_PIPELINE_STAGES = PIPELINE_STAGES;

// Mirrors computeExpStage's own null-handling (unpaid vs individually-
// already-done) so "why is this client not showing a stage" never has a
// different answer here than it does on the per-client badge.
export function pipelineBucketForExp(client) {
  if (client.exp_completed || client.exp_na) return "completed";
  if (!client.is_paid) return "unpaid";
  return client.workflowStage?.exp?.type || "unpaid";
}

export function pipelineBucketForTuEq(client) {
  const tuDone = client.tu_completed || client.tu_na;
  const eqDone = client.eq_completed || client.eq_na;
  if (tuDone && eqDone) return "completed";
  if (!client.is_paid) return "unpaid";
  return client.workflowStage?.tuEq?.type || "unpaid";
}

/**
 * Aggregate stage counts for the Pipeline dashboard view, computed
 * entirely off the already-loaded/enriched client list (every field read
 * here is already produced by clientsData.js#fetchEnrichedClients +
 * computeWorkflowStage above), so this never issues a new query of its
 * own.
 *
 * `all` is the merged, single-row view WorkflowPipeline.jsx now shows
 * (EXP is no longer displayed as a separate lane from TU/EQ, since both
 * follow the identical cycle) — a client is counted at most ONCE per
 * stage even if both their EXP lane and their TU/EQ lane happen to sit at
 * that same stage simultaneously, so a tile's count always exactly
 * matches the number of clients its drill-down list shows (see
 * clientFlags.js's matching `pipeline_all_*` filters, which use the same
 * "either lane" predicate). `exp`/`tuEq` are kept too, per-lane, for
 * anything that still wants the individual breakdown.
 */
export function summarizePipeline(clients) {
  const expCounts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, 0]));
  const tuEqCounts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, 0]));
  const allCounts = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, 0]));

  (clients || []).forEach((c) => {
    const expKey = pipelineBucketForExp(c);
    const tuEqKey = pipelineBucketForTuEq(c);
    if (expKey in expCounts) expCounts[expKey] += 1;
    if (tuEqKey in tuEqCounts) tuEqCounts[tuEqKey] += 1;

    const stagesHit = new Set([expKey, tuEqKey].filter((k) => k in allCounts));
    stagesHit.forEach((k) => { allCounts[k] += 1; });
  });

  return {
    exp: PIPELINE_STAGES.map((s) => ({ ...s, count: expCounts[s.key] || 0 })),
    tuEq: PIPELINE_STAGES.map((s) => ({ ...s, count: tuEqCounts[s.key] || 0 })),
    all: PIPELINE_STAGES.map((s) => ({ ...s, count: allCounts[s.key] || 0 })),
  };
}
