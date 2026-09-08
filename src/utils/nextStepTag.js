// src/utils/nextStepTag.js
//
// "What does this client need next" — a single, prioritized tag per client
// for AdminClientList.jsx's client table. utils/clientFlags.js#deriveClientFlags
// already does this kind of synthesis for the Ops Dashboard, but off a
// heavier pipeline (utils/clientsData.js#fetchEnrichedClients, which also
// pulls in document_routing/call_routing for the full "call TU now, due
// Aug 4" level of workflowStage.js detail). AdminClientList.jsx runs off
// the lighter useAdminClients.js pipeline instead, which doesn't load any
// of that — so this is a smaller, purpose-built version covering payment/
// document/review-queue gaps plus the bureau completion fields
// useAdminClients.js already selects. If AdminClientList.jsx ever needs
// exact call-scheduling detail too, the right fix is switching it onto
// clientsData.js's pipeline rather than growing this file to duplicate
// more of it.
//
// Known gap: Priority 1's Authorization Hold (utils/authorizationHold.js)
// isn't included here — it needs approved_*_count columns and a heavier
// per-bureau comparison this lighter pipeline doesn't have loaded either.
// A client with an authorization hold will currently show whatever tag
// its other signals produce instead.

import { fetchChunked } from "./clientsData";

const REQUIRED_ASSET_KEYS = ["license", "ssn", "poa"];
const DOC_ISSUE_STATUSES = new Set(["expired", "invalid", "needs_review"]);

/**
 * Bulk-fetches the extra per-client signals this needs beyond what
 * useAdminClients.js's own client query already selects — same
 * "one `.in(client_id)` query, build a Set" pattern
 * clientsData.js#fetchEnrichedClients already uses against these exact
 * tables, kept as its own small function here rather than importing that
 * module wholesale (its fetchEnrichedClients isn't broken into reusable
 * pieces, and pulls in document_routing/call_routing this doesn't need).
 * Each fetch degrades independently (empty Set) if its table/migration
 * isn't present yet, rather than failing the whole client list.
 */
export async function fetchNextStepSignals(supabase, clientIds) {
  const ids = Array.from(new Set((clientIds || []).filter(Boolean)));
  const signals = {
    hasAllCoverLetterAssets: new Set(),
    hasDocIssue: new Set(),
    hasPendingCountReview: new Set(),
    hasPendingAiFlag: new Set(),
  };
  if (ids.length === 0) return signals;

  const assetKeysByClient = new Map();
  try {
    // Chunked (utils/clientsData.js#fetchChunked) — an unchunked
    // .in("client_id", ids) with a fleet-wide id list (1000+ clients) gets
    // encoded into a GET query string long enough to be rejected outright
    // (400) before it reaches Postgres, which silently came back as zero
    // rows here and made every single client look like they were missing
    // all 3 documents regardless of their actual state.
    const { data: docs, error } = await fetchChunked(ids, (chunkIds) =>
      supabase
        .from("client_documents")
        .select("client_id, file_name, validation_status")
        .in("client_id", chunkIds)
        .in("file_name", REQUIRED_ASSET_KEYS)
    );
    if (error) throw error;
    (docs || []).forEach((d) => {
      if (!assetKeysByClient.has(d.client_id)) assetKeysByClient.set(d.client_id, new Set());
      assetKeysByClient.get(d.client_id).add(d.file_name);
      if (DOC_ISSUE_STATUSES.has(d.validation_status)) signals.hasDocIssue.add(d.client_id);
    });
  } catch (e) {
    console.warn("[nextStepTag] Could not load client_documents:", e.message);
  }
  assetKeysByClient.forEach((keys, clientId) => {
    if (REQUIRED_ASSET_KEYS.every((k) => keys.has(k))) signals.hasAllCoverLetterAssets.add(clientId);
  });

  try {
    const { data: reviews, error } = await fetchChunked(ids, (chunkIds) =>
      supabase
        .from("count_review_requests")
        .select("client_id")
        .in("client_id", chunkIds)
        .eq("status", "pending")
    );
    if (error) throw error;
    (reviews || []).forEach((r) => signals.hasPendingCountReview.add(r.client_id));
  } catch (e) {
    if (!/does not exist/i.test(e.message || "")) console.warn("[nextStepTag] Could not load count_review_requests:", e.message);
  }

  try {
    const { data: flags, error } = await fetchChunked(ids, (chunkIds) =>
      supabase
        .from("ai_review_queue")
        .select("client_id")
        .in("client_id", chunkIds)
        .eq("status", "pending")
    );
    if (error) throw error;
    (flags || []).forEach((f) => signals.hasPendingAiFlag.add(f.client_id));
  } catch (e) {
    if (!/does not exist/i.test(e.message || "")) console.warn("[nextStepTag] Could not load ai_review_queue:", e.message);
  }

  return signals;
}

const BUREAU_FIELDS = [
  { key: "exp", label: "EXP", completed: "exp_completed", na: "exp_na" },
  { key: "tu", label: "TU", completed: "tu_completed", na: "tu_na" },
  { key: "eq", label: "EQ", completed: "eq_completed", na: "eq_na" },
];

/**
 * `client` needs is_paid, all_completed, date_completed, and
 * exp/tu/eq_completed + exp/tu/eq_na — all already present on every row
 * useAdminClients.js produces (all_completed via
 * utils/inquiryCounts.js#allBureausResolved). `signals` is
 * fetchNextStepSignals's output, keyed by client.id.
 *
 * Priority order (most blocking first): payment, AI review flag, count
 * review, document issue, missing documents, completed/ready-to-complete,
 * then whichever bureaus are still open.
 */
export function getNextStepTag(client, signals) {
  const id = client?.id;
  const has = (set) => !!(id && set?.has(id));

  if (!client?.is_paid) {
    return { key: "needs_payment", label: "Needs Payment", variant: "danger", icon: "bi-currency-dollar" };
  }
  if (has(signals?.hasPendingAiFlag)) {
    return { key: "ai_flagged", label: "AI Flagged — Review", variant: "info", icon: "bi-robot", textDark: true };
  }
  if (has(signals?.hasPendingCountReview)) {
    return { key: "needs_count_review", label: "Needs Count Approval", variant: "warning", icon: "bi-clipboard-check", textDark: true };
  }
  if (has(signals?.hasDocIssue)) {
    return { key: "doc_issue", label: "Document Issue", variant: "danger", icon: "bi-file-earmark-excel-fill" };
  }
  if (!client.date_completed && signals?.hasAllCoverLetterAssets && !has(signals.hasAllCoverLetterAssets)) {
    return { key: "needs_documents", label: "Needs ID/SSN/POA", variant: "warning", icon: "bi-file-earmark-text", textDark: true };
  }
  if (client.date_completed || client.all_completed) {
    if (!client.date_completed) {
      return { key: "ready_to_complete", label: "Ready to Complete", variant: "success", icon: "bi-flag-fill" };
    }
    return { key: "completed", label: "Completed", variant: "success", icon: "bi-check-circle-fill" };
  }

  const waiting = BUREAU_FIELDS.filter((b) => !client[b.completed] && !client[b.na]).map((b) => b.label);
  if (waiting.length > 0) {
    return { key: "waiting_bureaus", label: `Waiting: ${waiting.join(", ")}`, variant: "secondary", icon: "bi-hourglass-split" };
  }
  return { key: "in_progress", label: "In Progress", variant: "secondary", icon: "bi-arrow-repeat" };
}
