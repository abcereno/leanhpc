// src/utils/completionWebhook.js
//
// Single shared source for the LeadConnector "bureau completion" webhook —
// previously two independent, near-identical copies of this exact payload-
// building + fetch/no-cors-fallback logic lived in
// src/hooks/useInquiriesThread.js (classification-based services:
// Inquiry Deletion/Case Management) and
// src/components/admin/client-profile/ClientHeader.jsx (direct-bureau
// services: Fraud Alert Removal/Personal Identifiers). Consolidated here so
// the payload shape can't drift between the two again, and so a new event
// type (bureau_completed, below) only has to be written once.
//
// Two events, same `client` block shape:
//   - "client_completed": every bureau is now resolved (completed or N/A).
//     Fired at most once per client (see each caller's own "already done"
//     guard) — the original, only event this file used to send.
//   - "bureau_completed": ONE bureau just newly resolved, independent of
//     whether the other two are done yet. New — added so a GHL workflow can
//     react the moment (say) Experian alone finishes Inquiry Deletion,
//     instead of only ever hearing about it once all three bureaus close.
//
// `client.service_id`/`client.service_label` are new fields (previously
// absent) — added so a single shared GHL workflow can branch on service the
// same way it already branches on `client.company_name`, instead of
// needing a different webhook URL per service.
import { supabase } from "../supabaseClient";
import { serviceById, serviceByDisputeMethod } from "./services";
import { sendHighLevelEvent } from "./highlevelWebhook";

// URL now lives in integration_settings ("Bureau Completion Webhook" on the
// admin Integration Settings page — see sql/add_integration_settings.sql,
// which seeds it with what used to be this hardcoded literal) instead of
// here, so it can be rotated without a deploy.
const COMPLETION_WEBHOOK_KEY = "highlevel_completion_webhook_url";

function resolveService(clientRow) {
  const svc =
    (clientRow?.service_id && serviceById(clientRow.service_id)) ||
    serviceByDisputeMethod(clientRow?.dispute_method) ||
    null;
  return {
    service_id: svc?.id || clientRow?.service_id || null,
    service_label: svc?.label || clientRow?.dispute_method || null,
  };
}

function buildClientBlock(clientRow, adminName) {
  const { service_id, service_label } = resolveService(clientRow);
  return {
    id: clientRow.id,
    full_name: clientRow.full_name || "",
    email: clientRow.email || "",
    phone: clientRow.phone || "",
    admin_id: clientRow.admin_id || null,
    admin_name: adminName || "",
    company_id: clientRow.company_id || null,
    company_name: clientRow.company_name || "",
    agent_id: clientRow.agent_id || null,
    agent_name: clientRow.agent || "",
    service_id,
    service_label,
  };
}

// Fresh, minimal read of exactly what the payload needs — every caller used
// to either do this same lookup itself (useInquiriesThread.js) or trust a
// possibly-stale already-loaded client object (ClientHeader.jsx, which is
// how the original double-fire/inaccurate-"All" bug happened — see
// finalizeBureauAction's own comment). Always fetching fresh here removes
// that staleness risk for every caller at once.
async function fetchClientForWebhook(clientId) {
  const { data: clientRow, error } = await supabase
    .from("clients")
    .select("id, full_name, email, phone, admin_id, company_id, company_name, agent_id, agent, service_id, dispute_method")
    .eq("id", clientId)
    .single();
  if (error || !clientRow) return null;

  let adminName = null;
  if (clientRow.admin_id) {
    const { data: adminRow } = await supabase.from("profiles").select("full_name").eq("id", clientRow.admin_id).single();
    if (adminRow) adminName = adminRow.full_name;
  }
  return { clientRow, adminName };
}

async function postCompletionWebhook(payload) {
  const result = await sendHighLevelEvent(COMPLETION_WEBHOOK_KEY, payload);
  if (result.ok === false && !result.skipped) {
    console.error("❌ Completion webhook failed:", result.statusText, result.body);
  }
}

// "client_completed" — all three bureaus now resolved (completed or N/A).
export async function sendFullCompletionWebhook({ clientId, statuses, newlyCompleted, reason = "transition_only" }) {
  const resolved = await fetchClientForWebhook(clientId);
  if (!resolved) return;
  await postCompletionWebhook({
    event: "client_completed",
    client: buildClientBlock(resolved.clientRow, resolved.adminName),
    statuses,
    completed: newlyCompleted,
    reason,
    completed_at: new Date().toISOString(),
  });
}

// "bureau_completed" — ONE bureau just newly resolved. `status` is "done"
// (fully deleted/resolved) or "na" (nothing disputable there) — the same
// two values classifyBureauStatus (utils/inquiryCounts.js) treats as
// "resolved" everywhere else in this app.
export async function sendBureauCompletionWebhook({ clientId, bureau, status, reason }) {
  const resolved = await fetchClientForWebhook(clientId);
  if (!resolved) return;
  await postCompletionWebhook({
    event: "bureau_completed",
    client: buildClientBlock(resolved.clientRow, resolved.adminName),
    bureau,
    status,
    reason,
    completed_at: new Date().toISOString(),
  });
}
