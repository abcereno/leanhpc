// src/utils/fileReadiness.js
//
// Shared "is this LTOS file ready for Roselle" logic for the CS
// Dashboard's File Status view (src/components/admin/customer-service/
// CsDashboard2.jsx). A "file" here is always a `clients` row (paid or
// unpaid) — document/payment readiness can only be tracked once someone
// is an actual client record, never a raw company_leads prospect (no
// client_documents linkage exists for those).
//
// Reuses the exact same identity-document merge logic as
// useAlignmentDocs.js (legacy CoverLetterAssets.jsx doc_type rows +
// LTOS CoverLetterAssetsLTOS.jsx file_name rows), but as a bulk fetch
// over many clients at once rather than that hook's single-client
// fetch — the File Status list view needs every LTOS client's status in
// one pass, not one hook instance per row.
//
// SSN is deliberately NOT part of this — LTOS never collects an SSN
// document at all (see useAlignmentDocs.js's own comment: "ssn stays
// legacy-only"), so a File Status gate that included it could never be
// satisfied for any LTOS client. Only Photo ID (license) and Proof of
// Address (poa) are checked here.
import { supabase } from "../supabaseClient";
import { ROSELLE_ADMIN_ID } from "./staff";
import { LTOS_COMPANY_ID } from "./companies";
import { sendClientDoneEvent, sendNeedsMoreDocumentsEvent } from "./highlevelWebhook";

/** "missing" (never uploaded) | "uploaded" (on file, not yet a clean AI-verified pass) | "verified" (validation_status is "valid"). */
export function computeIdentityStatus(row) {
  if (!row) return "missing";
  if (row.validation_status === "valid") return "verified";
  return "uploaded";
}

/** "not_sent" | "pending" (invoice sent, not yet paid) | "verified" (is_paid). */
export function computePaymentStatus(client) {
  if (client?.is_paid) return "verified";
  if (client?.invoice_sent_at) return "pending";
  return "not_sent";
}

/**
 * Which File Status tab a client belongs in. Docs take priority over
 * payment (a file with unfinished docs is "Missing Docs" even if payment
 * already cleared) — matches the reviewed reference design's own
 * observed behavior.
 */
export function computeFileBucket({ idStatus, addressStatus, paymentStatus }) {
  const docsVerified = idStatus === "verified" && addressStatus === "verified";
  if (docsVerified && paymentStatus === "verified") return "ready";
  if (docsVerified) return "payment_pending";
  const nothingStarted = idStatus === "missing" && addressStatus === "missing" && paymentStatus === "not_sent";
  if (nothingStarted) return "new_leads";
  return "missing_docs";
}

// Same slot-merge rule as useAlignmentDocs.js's identitySlot() — kept as
// its own copy rather than importing that hook (which is single-client
// and stateful) since this needs to run over a plain rows array here.
function identitySlot(row) {
  if (["license", "poa"].includes(row.doc_type)) return row.doc_type;
  if (row.file_name === "identity") return "license";
  if (row.file_name === "address") return "poa";
  return null;
}

/**
 * Bulk fetch: { [clientId]: { license: row|null, poa: row|null } } for
 * every id in clientIds. One query, not one per client.
 */
export async function fetchIdentityDocsForClients(clientIds) {
  const ids = (clientIds || []).filter(Boolean);
  const result = new Map(ids.map((id) => [id, { license: null, poa: null }]));
  if (ids.length === 0) return result;

  // Two plain .in() queries merged client-side rather than one .or() —
  // same reasoning as useAlignmentDocs.js's load(): this codebase has no
  // tested .or() filter-string usage to confirm the syntax against,
  // while .in() is used everywhere already.
  const SELECT = "client_id, file_name, file_url, doc_type, validation_status, validation_details, created_at";
  const [legacyRes, ltosRes] = await Promise.all([
    supabase.from("client_documents").select(SELECT).in("client_id", ids).in("doc_type", ["license", "poa"]),
    supabase.from("client_documents").select(SELECT).in("client_id", ids).in("file_name", ["identity", "address"]),
  ]);

  // sql/add_document_alignment_check.sql may not be run yet — fail soft,
  // every client just shows "missing" rather than breaking the whole
  // File Status view.
  const error = legacyRes.error || ltosRes.error;
  if (error) {
    console.error("fetchIdentityDocsForClients error:", error);
    return result;
  }

  // Newest first, so "first seen per slot" below picks the latest.
  const rows = [...(legacyRes.data || []), ...(ltosRes.data || [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  rows.forEach((row) => {
    const slot = identitySlot(row);
    if (!slot) return;
    const bucket = result.get(row.client_id);
    if (bucket && !bucket[slot]) bucket[slot] = row;
  });

  return result;
}

// Fires needs_more_documents / client_completed at most once per bucket per
// clientId per page load — a plain in-memory Set, not persisted anywhere.
// maybeAssignToRoselle is called after every doc check/override and every
// mark-paid, which can happen several times in a row for the same client
// (e.g. checking license then POA back to back); without this a single
// document session could fire the same GHL event repeatedly. Session-only
// is an intentional tradeoff — a fresh page load re-fires once, which is
// harmless for a GHL workflow reacting to "this file needs docs"/"this
// file is done", same as this app already accepts for the older bureau
// completion webhooks (see completionWebhook.js's own per-caller guard
// comment).
const firedBucketEvents = new Set();

function fireBucketEventOnce(clientId, bucket) {
  const dedupeKey = `${clientId}:${bucket}`;
  if (firedBucketEvents.has(dedupeKey)) return;
  firedBucketEvents.add(dedupeKey);
  if (bucket === "missing_docs") sendNeedsMoreDocumentsEvent(clientId);
  if (bucket === "ready") sendClientDoneEvent(clientId, { reason: "file_status_ready" });
}

/**
 * Call after any action that could complete a file (a doc check/override
 * in AlignmentCheckPanel.jsx, a payment being marked paid, or an
 * opportunistic sweep on CS Dashboard load). Re-reads fresh state,
 * fires the matching HighLevel event for the client's current File Status
 * bucket (see fireBucketEventOnce above), and — if the file is now fully
 * ready and not already assigned to Roselle — assigns it to her. Silent
 * no-op otherwise — safe to call speculatively after any client update
 * without checking readiness yourself first.
 */
export async function maybeAssignToRoselle(clientId) {
  if (!clientId) return { assigned: false };

  const { data: client, error } = await supabase
    .from("clients")
    .select("id, is_paid, invoice_sent_at, admin_id, company_id")
    .eq("id", clientId)
    .single();
  if (error || !client) return { assigned: false };
  // Roselle's queue is the LTOS File Status pipeline specifically — never
  // reassign a client belonging to some other company just because their
  // docs happened to get verified.
  if (client.company_id !== LTOS_COMPANY_ID) return { assigned: false };

  const docs = await fetchIdentityDocsForClients([clientId]);
  const { license, poa } = docs.get(clientId) || {};
  const bucket = computeFileBucket({
    idStatus: computeIdentityStatus(license),
    addressStatus: computeIdentityStatus(poa),
    paymentStatus: computePaymentStatus(client),
  });
  fireBucketEventOnce(clientId, bucket);

  if (client.admin_id === ROSELLE_ADMIN_ID) return { assigned: false };
  if (bucket !== "ready") return { assigned: false };

  const { error: updErr } = await supabase.from("clients").update({ admin_id: ROSELLE_ADMIN_ID }).eq("id", clientId);
  if (updErr) {
    console.error("maybeAssignToRoselle update error:", updErr);
    return { assigned: false };
  }
  return { assigned: true };
}
