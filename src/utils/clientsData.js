// src/utils/clientsData.js
//
// Shared fetch + enrichment for fleet-wide client data, used by the new
// Operations Dashboard (src/hooks/useOpsSummary.js) and any future ops
// sections that need the same "all clients, business-day aging, task
// counts" shape.
//
// NOTE: this intentionally mirrors the fetch/enrich logic already living in
// src/hooks/useAdminClients.js (which powers the existing /clients page).
// It is kept as a separate copy rather than a shared import so the
// live, heavily-used Client List page is not touched by this ops-dashboard
// work. If/when useAdminClients.js gets refactored, it should be pointed at
// this same helper to remove the duplication.

import { supabase } from "../supabaseClient";
import { getHolidays, calculateBusinessDays, calculatePaidRunningDays } from "./dateHelpers";
import { clientHasAuthorizationHold } from "./authorizationHold";
import { computeWorkflowStage } from "./workflowStage";

// Fleet-wide `.in("client_id", clientIds)` queries below can easily carry
// 1,000+ UUIDs once the client list grows — encoded into a GET query string
// that's long enough to get rejected outright (400 Bad Request) before it
// ever reaches Postgres, silently returning no rows. Splitting into chunks
// keeps every request well under that limit. Each client_id only ever
// appears in one chunk, so per-client "first row wins" ordering logic
// (latest comment/note) still works correctly after merging.
const ID_CHUNK_SIZE = 150;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Runs `queryFn(chunkOfIds)` (a function returning a Supabase query builder)
 * once per chunk of `ids`, in parallel, and merges the results. Returns the
 * first error encountered (if any) alongside whatever data did come back,
 * so callers can log/degrade the same way they would for a single request.
 */
// Exported so other bulk `.in("client_id", ids)` fetches outside this file
// (e.g. utils/nextStepTag.js) hit the same 150-id chunking instead of each
// needing to remember/duplicate the 400-Bad-Request reasoning above.
export async function fetchChunked(ids, queryFn) {
  if (!ids.length) return { data: [], error: null };
  const chunks = chunk(ids, ID_CHUNK_SIZE);
  const results = await Promise.all(chunks.map((c) => queryFn(c)));
  const data = [];
  let error = null;
  for (const r of results) {
    if (r.error && !error) error = r.error;
    if (r.data) data.push(...r.data);
  }
  return { data, error };
}

export const CLIENT_SUMMARY_SELECT = `
  id, full_name, email, phone, created_at, paid_at, date_completed, is_paid,
  dispute_method, service_id, counter, start_inquiries, start_date,
  exp_na, tu_na, eq_na, exp_completed, tu_completed, eq_completed,
  exp_status, tu_status, eq_status,
  admin_id, company_id, affiliate_id, agent, progress, status_stage,
  is_paused, paused_at, paused_days_total,
  processing_duration, tu_eq_docs_submitted_at, last_report_update_at,
  approved_exp_count, approved_tu_count, approved_eq_count,
  company_tasks ( id, is_completed )
`;

// Same shape, minus the Phase 0 approved_*_count columns — used as a
// fallback below if sql/phase0_persisted_counts.sql hasn't been run on this
// database yet, so a missing optional column doesn't blank out the entire
// client list/ops dashboard (same reasoning as useAdminClients.js's
// dispute_round retry).
const CLIENT_SUMMARY_SELECT_FALLBACK = CLIENT_SUMMARY_SELECT.replace(
  /approved_exp_count, approved_tu_count, approved_eq_count,\s*/,
  ""
);

/**
 * Adds business-day aging, completion, and task-count fields to a raw
 * `clients` row. Mirrors useAdminClients.js's enrichRows(), plus a
 * `bureausAllDone` field (treats an N/A bureau as "done", matching the
 * `update_client_completion_status` DB trigger's own definition) which
 * useAdminClients.js's simpler `all_completed` does not account for.
 */
export function enrichClientRows(rows, holidays) {
  const now = new Date();

  return rows.map((r) => {
    const unpaidEnd = r.paid_at ? new Date(r.paid_at) : now;
    const createdRunningDays = calculateBusinessDays(r.created_at, unpaidEnd, holidays);

    // Pause-aware — see dateHelpers.js#calculatePaidRunningDays. This is
    // what feeds Production Queue's aging buckets/badges (via
    // agingDaysCurrent, utils/aging.js#getCurrentAgingDays), so a paused
    // client now actually stops aging instead of silently climbing into
    // "20-29 Days" / "30+ Days" right alongside active files.
    const paidRunningDays = calculatePaidRunningDays(r, holidays, now);

    const all_completed = !!(r.exp_completed && r.tu_completed && r.eq_completed);
    const bureausAllDone = !!(
      (r.exp_completed || r.exp_na) &&
      (r.tu_completed || r.tu_na) &&
      (r.eq_completed || r.eq_na)
    );

    const companies = r.companies ?? (r.company_name ? { company_name: r.company_name } : undefined);
    const profiles = r.profiles ?? (r.admin_full_name ? { full_name: r.admin_full_name } : undefined);

    const pendingTasksCount = r.company_tasks
      ? r.company_tasks.filter((t) => !t.is_completed).length
      : 0;
    const completedTasksCount = r.company_tasks
      ? r.company_tasks.filter((t) => t.is_completed).length
      : 0;

    const dbProgress = r.progress ? Number(r.progress) : 0;
    const pScore = Math.round(dbProgress * 100);

    // computeWorkflowStage reads is_paid/exp_completed/exp_na/tu_completed/
    // tu_na/eq_completed/eq_na/exp_status/tu_status/eq_status straight off
    // `r`, plus pendingDocTask/latestDocTask/pendingCalls/docRoundMax
    // attached during the merge step above — passing `r` directly avoids
    // re-listing every field here and keeps this in sync automatically if
    // CLIENT_SUMMARY_SELECT ever adds more bureau-status-like columns.
    const workflowStage = computeWorkflowStage(r);

    return {
      ...r,
      progress: pScore,
      companies,
      profiles,
      createdRunningDays,
      paidRunningDays,
      all_completed,
      bureausAllDone,
      pendingTasksCount,
      completedTasksCount,
      workflowStage,
    };
  });
}

/**
 * Fetches every client (fleet-wide), joins in assigned-admin and company
 * names, and returns enriched rows ready for dashboard aggregation.
 */
export async function fetchEnrichedClients() {
  const holidays = await getHolidays();

  const { data: companiesData, error: companiesErr } = await supabase
    .from("companies")
    .select("id, company_name")
    .order("company_name");
  if (companiesErr) throw companiesErr;

  let selectedFields = CLIENT_SUMMARY_SELECT;
  let { data: baseRows, error: baseErr } = await supabase
    .from("clients")
    .select(selectedFields)
    .order("created_at", { ascending: false })
    .range(0, 99999);

  if (baseErr && /approved_(exp|tu|eq)_count/i.test(baseErr.message || "")) {
    console.warn("clients.approved_*_count not found (run sql/phase0_persisted_counts.sql) — falling back without it.");
    selectedFields = CLIENT_SUMMARY_SELECT_FALLBACK;
    ({ data: baseRows, error: baseErr } = await supabase
      .from("clients")
      .select(selectedFields)
      .order("created_at", { ascending: false })
      .range(0, 99999));
  }

  // sql/add_services.sql may not have been run yet either — same
  // defensive fallback, independent of the approved_*_count one above so
  // either migration (or neither) missing still degrades gracefully.
  if (baseErr && /service_id/i.test(baseErr.message || "")) {
    console.warn("clients.service_id not found (run sql/add_services.sql) — falling back without it.");
    selectedFields = selectedFields.replace(/service_id,\s*/, "");
    ({ data: baseRows, error: baseErr } = await supabase
      .from("clients")
      .select(selectedFields)
      .order("created_at", { ascending: false })
      .range(0, 99999));
  }

  // sql/add_last_report_update.sql may not have been run yet either — same
  // independent defensive fallback (getCaseManagementCountdown already
  // falls back to paid_at when this field is missing/null, so degrading
  // here just means that fallback kicks in for everyone).
  if (baseErr && /last_report_update_at/i.test(baseErr.message || "")) {
    console.warn("clients.last_report_update_at not found (run sql/add_last_report_update.sql) — falling back without it.");
    selectedFields = selectedFields.replace(/last_report_update_at,\s*/, "");
    ({ data: baseRows, error: baseErr } = await supabase
      .from("clients")
      .select(selectedFields)
      .order("created_at", { ascending: false })
      .range(0, 99999));
  }

  if (baseErr) throw baseErr;

  const adminIds = Array.from(new Set((baseRows || []).map((r) => r.admin_id).filter(Boolean)));
  const companyIds = Array.from(new Set((baseRows || []).map((r) => r.company_id).filter(Boolean)));

  let adminMap = new Map();
  if (adminIds.length) {
    const { data: admins } = await supabase.from("profiles").select("id, full_name").in("id", adminIds);
    if (admins) adminMap = new Map(admins.map((a) => [a.id, a.full_name]));
  }

  let companyMap = new Map();
  if (companyIds.length) {
    const { data: companies } = await supabase.from("companies").select("id, company_name").in("id", companyIds);
    if (companies) companyMap = new Map(companies.map((c) => [c.id, c.company_name]));
  }

  // "Missing Documents" checks the real cover-letter assets (license, SSN,
  // POA) rather than any cached/derived flag — see CoverLetterAssets.jsx,
  // which stores each as a client_documents row keyed by file_name. Bulk
  // fetch which of the three keys exist per client, same pattern as the
  // admin/company lookups above, so clientFlags.js can check actual asset
  // presence instead of a boolean that could drift out of sync.
  const clientIds = (baseRows || []).map((r) => r.id);
  const requiredAssetKeys = new Set(["license", "ssn", "poa"]);
  // Statuses the AI validity check (sql/add_document_validation.sql,
  // supabase/functions/validate-document) can return that mean a staff
  // member should look at this document — everything else ('valid',
  // 'pending') is fine to stay quiet.
  const DOC_ISSUE_STATUSES = new Set(["expired", "invalid", "needs_review"]);
  let assetKeysByClient = new Map();
  let docIssueClientIds = new Set();
  {
    const { data: docs, error: docsErr } = await fetchChunked(clientIds, (ids) =>
      supabase
        .from("client_documents")
        .select("client_id, file_name, validation_status")
        .in("client_id", ids)
        .in("file_name", Array.from(requiredAssetKeys))
    );
    if (docsErr) {
      console.warn("[clientsData] Could not load client_documents (cover-letter assets will show as missing):", docsErr.message);
    }
    (docs || []).forEach((d) => {
      if (!assetKeysByClient.has(d.client_id)) assetKeysByClient.set(d.client_id, new Set());
      assetKeysByClient.get(d.client_id).add(d.file_name);
      if (DOC_ISSUE_STATUSES.has(d.validation_status)) docIssueClientIds.add(d.client_id);
    });
  }

  // Latest comment (Activity Thread, `comments` table) and latest Manager
  // Note (`client_notes` table) per client — surfaced on ProductionQueue.jsx
  // cards so a manager can see the most recent activity without opening
  // each profile. Neither table supports a server-side "top 1 per group"
  // query here, so fetch every row for these clients ordered newest-first
  // and keep only the first one seen per client_id client-side.
  let latestCommentByClient = new Map();
  {
    const { data: comments, error: commentsErr } = await fetchChunked(clientIds, (ids) =>
      supabase
        .from("comments")
        .select("client_id, text, author, timestamp")
        .in("client_id", ids)
        .order("timestamp", { ascending: false })
    );
    if (commentsErr) {
      console.warn("[clientsData] Could not load latest comments:", commentsErr.message);
    }
    (comments || []).forEach((c) => {
      if (!latestCommentByClient.has(c.client_id)) {
        latestCommentByClient.set(c.client_id, { text: c.text, author: c.author, at: c.timestamp });
      }
    });
  }

  // sql/client_notes.sql may not have been run yet — degrade to no notes
  // rather than throwing (same fallback useClientNotes.js already uses).
  //
  // Ordered is_pinned first (matching useClientNotes.js's own sort) so the
  // "first note seen per client" below is a pinned one whenever one exists
  // — that lets ProductionQueue.jsx surface hasPinnedNote directly off this
  // same latestNote value instead of a second bulk fetch.
  let latestNoteByClient = new Map();
  {
    const { data: notes, error: notesErr } = await fetchChunked(clientIds, (ids) =>
      supabase
        .from("client_notes")
        .select("client_id, text, author_name, note_type, is_pinned, created_at")
        .in("client_id", ids)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
    );
    if (notesErr && !/does not exist/i.test(notesErr.message || "")) {
      console.warn("[clientsData] Could not load latest client_notes:", notesErr.message);
    }
    (notes || []).forEach((n) => {
      if (!latestNoteByClient.has(n.client_id)) {
        latestNoteByClient.set(n.client_id, { text: n.text, author: n.author_name, noteType: n.note_type, isPinned: !!n.is_pinned, at: n.created_at });
      }
    });
  }

  // HPC Ops Sprint Priority 2 — drives clientFlags.js's countReviewPending,
  // which was a hardcoded `false` stub until sql/count_review.sql existed.
  // sql/count_review.sql may not have been run yet on every environment, so
  // degrade to "no pending reviews" rather than throwing (same pattern as
  // client_notes above).
  //
  // Also carries bureau/ai_count now (not just client_id) — Priority 1
  // (Authorization Protection) needs the actual pending numbers per bureau
  // to know whether a client's disputable count has grown past what's
  // already approved (see utils/authorizationHold.js), not just whether a
  // review exists at all.
  const clientsWithPendingCountReview = new Set();
  const pendingRequestsByClient = new Map();
  {
    const { data: pendingReviews, error: reviewsErr } = await fetchChunked(clientIds, (ids) =>
      supabase
        .from("count_review_requests")
        .select("client_id, bureau, ai_count, status")
        .in("client_id", ids)
        .eq("status", "pending")
    );
    if (reviewsErr && !/does not exist/i.test(reviewsErr.message || "")) {
      console.warn("[clientsData] Could not load pending count reviews:", reviewsErr.message);
    }
    (pendingReviews || []).forEach((r) => {
      clientsWithPendingCountReview.add(r.client_id);
      if (!pendingRequestsByClient.has(r.client_id)) pendingRequestsByClient.set(r.client_id, []);
      pendingRequestsByClient.get(r.client_id).push(r);
    });
  }

  // Self-healing pass (sql/gate_exp_calls_on_docs_round.sql) — before
  // reading document_routing/call_routing below, make sure they're actually
  // up to date: auto-queues EXP/TU/EQ calls once 7 days have passed since
  // that client's latest document_routing round was created AND FTC/CFPB/
  // that bureau's own submitted checkbox are all checked. Awaited so the
  // enrichment below reflects the healed state instead of being one
  // page-load behind it. Missing-function failure (migration not run yet)
  // degrades to "no auto-healing this load" rather than breaking the whole
  // dashboard — everything below still works off whatever rows already
  // exist.
  const { error: syncErr } = await supabase.rpc("sync_all_workflow_queues");
  if (syncErr && !/does not exist/i.test(syncErr.message || "")) {
    console.warn("[clientsData] sync_all_workflow_queues failed (run sql/gate_exp_calls_on_docs_round.sql):", syncErr.message);
  }

  // Workflow stage (Production Queue's "where is this client right now" —
  // see utils/workflowStage.js) — reads the exact same two tables
  // DocumentRouting.jsx / CallRouting.jsx already drive their queues from,
  // rather than a new schema, so it can't disagree with what's actually
  // queued. `docRoundMaxByClient` mirrors DocumentRouting.jsx's own
  // `maxRounds` calc; `latestDocByClient` (the row AT that max round,
  // regardless of status) is what workflowStage.js needs to compute the
  // TU/EQ 7-day countdown from created_at.
  const docRoundMaxByClient = new Map();
  const latestDocByClient = new Map();
  const pendingDocByClient = new Map();
  {
    const { data: docRows, error: docErr } = await fetchChunked(clientIds, (ids) =>
      supabase
        .from("document_routing")
        .select("client_id, round_count, status, created_at, assigned_admin_id, ftc_completed, cfpb_completed, exp_submitted, tu_submitted, eq_submitted")
        .in("client_id", ids)
    );
    if (docErr && !/does not exist/i.test(docErr.message || "")) {
      console.warn("[clientsData] Could not load document_routing (workflow stage will be approximate):", docErr.message);
    }
    (docRows || []).forEach((d) => {
      const prevMax = docRoundMaxByClient.get(d.client_id) || 0;
      if (d.round_count > prevMax) {
        docRoundMaxByClient.set(d.client_id, d.round_count);
        latestDocByClient.set(d.client_id, d);
      }
      if (d.status === "PENDING") {
        const existing = pendingDocByClient.get(d.client_id);
        if (!existing || d.round_count > existing.round_count) pendingDocByClient.set(d.client_id, d);
      }
    });
  }

  // call_routing rows are now per-bureau (sql/add_bureau_call_routing.sql)
  // — bureau is 'exp'/'tu'/'eq', or NULL for a legacy row created before
  // that migration, which is treated as covering all three bureaus (same
  // rule sql/self_healing_workflow_queues.sql uses to avoid double-queuing).
  // Tracked per client as up to 4 slots so workflowStage.js can tell
  // Experian's lane apart from TU/EQ's.
  const pendingCallsByClient = new Map();
  {
    const { data: callRows, error: callErr } = await fetchChunked(clientIds, (ids) =>
      supabase
        .from("call_routing")
        .select("client_id, status, scheduled_date, bureau, round_count, assigned_admin_id")
        .in("client_id", ids)
        .eq("status", "PENDING")
    );
    if (callErr && !/does not exist/i.test(callErr.message || "")) {
      console.warn("[clientsData] Could not load call_routing (workflow stage will be approximate):", callErr.message);
    }
    (callRows || []).forEach((c) => {
      if (!pendingCallsByClient.has(c.client_id)) {
        pendingCallsByClient.set(c.client_id, { exp: null, tu: null, eq: null, legacy: null });
      }
      const slot = c.bureau === "exp" || c.bureau === "tu" || c.bureau === "eq" ? c.bureau : "legacy";
      const entry = pendingCallsByClient.get(c.client_id);
      if (!entry[slot] || new Date(c.scheduled_date) < new Date(entry[slot].scheduled_date)) {
        entry[slot] = c;
      }
    });
  }

  // Docs/call routing rows can be assigned to any staff member (see
  // DocumentRouting.jsx/CallRouting.jsx's own admin dropdowns), not just
  // the client's own admin_id that `adminMap` above already covers.
  // Resolving names here — once, fleet-wide — is what lets
  // workflowStage.js answer "who to call for" / "who to create docs for"
  // with a name instead of Production Queue/Pipeline having to look it up
  // themselves per card.
  {
    const extraAdminIds = new Set();
    latestDocByClient.forEach((d) => {
      if (d.assigned_admin_id && !adminMap.has(d.assigned_admin_id)) extraAdminIds.add(d.assigned_admin_id);
    });
    pendingDocByClient.forEach((d) => {
      if (d.assigned_admin_id && !adminMap.has(d.assigned_admin_id)) extraAdminIds.add(d.assigned_admin_id);
    });
    pendingCallsByClient.forEach((slots) => {
      Object.values(slots).forEach((c) => {
        if (c?.assigned_admin_id && !adminMap.has(c.assigned_admin_id)) extraAdminIds.add(c.assigned_admin_id);
      });
    });
    if (extraAdminIds.size) {
      const { data: extraAdmins } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(extraAdminIds));
      (extraAdmins || []).forEach((a) => adminMap.set(a.id, a.full_name));
    }

    const withAssigneeName = (row) =>
      row ? { ...row, assignedAdminName: row.assigned_admin_id ? adminMap.get(row.assigned_admin_id) || null : null } : row;

    latestDocByClient.forEach((d, k) => latestDocByClient.set(k, withAssigneeName(d)));
    pendingDocByClient.forEach((d, k) => pendingDocByClient.set(k, withAssigneeName(d)));
    pendingCallsByClient.forEach((slots, k) =>
      pendingCallsByClient.set(k, {
        exp: withAssigneeName(slots.exp),
        tu: withAssigneeName(slots.tu),
        eq: withAssigneeName(slots.eq),
        legacy: withAssigneeName(slots.legacy),
      })
    );
  }

  const merged = (baseRows || []).map((r) => {
    const presentKeys = assetKeysByClient.get(r.id);
    return {
      ...r,
      admin_full_name: r.admin_id ? adminMap.get(r.admin_id) ?? null : null,
      company_name: r.company_id ? companyMap.get(r.company_id) ?? null : null,
      companies: r.company_id ? { company_name: companyMap.get(r.company_id) ?? "—" } : undefined,
      profiles: r.admin_id ? { full_name: adminMap.get(r.admin_id) ?? "—" } : undefined,
      hasAllCoverLetterAssets: !!presentKeys && ["license", "ssn", "poa"].every((k) => presentKeys.has(k)),
      hasDocIssue: docIssueClientIds.has(r.id),
      latestComment: latestCommentByClient.get(r.id) || null,
      latestNote: latestNoteByClient.get(r.id) || null,
      hasPinnedNote: !!latestNoteByClient.get(r.id)?.isPinned,
      hasPendingCountReview: clientsWithPendingCountReview.has(r.id),
      hasAuthorizationHold: clientHasAuthorizationHold(r, pendingRequestsByClient.get(r.id) || []),
      pendingDocTask: pendingDocByClient.get(r.id) || null,
      latestDocTask: latestDocByClient.get(r.id) || null,
      pendingCalls: pendingCallsByClient.get(r.id) || { exp: null, tu: null, eq: null, legacy: null },
      docRoundMax: docRoundMaxByClient.get(r.id) || 0,
    };
  });

  return {
    clients: enrichClientRows(merged, holidays),
    companies: companiesData || [],
  };
}
