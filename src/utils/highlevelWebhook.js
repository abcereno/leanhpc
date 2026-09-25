// src/utils/highlevelWebhook.js
//
// One shared sender for every outbound HighLevel (LeadConnector) webhook,
// reading its destination URL from integration_settings (see
// integrationSettings.js) instead of a hardcoded literal. Consolidates
// what used to be 4 near-identical fetch/fallback implementations
// (completionWebhook.js, LogDocumentModal.jsx, useBureauWebhookDispatcher.js,
// IndividualLayout.jsx) into one, and adds 4 new CS Dashboard event types
// (client_completed reuse aside, the new ones are needs_more_documents,
// processing_stage_changed, payment_status_changed) that all post to the
// single "CS Dashboard Events" webhook an admin configures on the new
// Integration Settings page.
//
// Every send is fire-and-forget from the caller's point of view (never
// throws), except sendTestPayload() below, which is used by the Settings
// page's "Send Test" button and DOES surface success/failure + the raw
// response so staff can confirm the URL actually works.
import { supabase } from "../supabaseClient";
import { getIntegrationSettingValue } from "./integrationSettings";
import { serviceById, serviceByDisputeMethod } from "./services";

// fetch → no-cors fallback, same pattern as completionWebhook.js. Returns
// {ok, status, statusText, body} for callers (like sendTestPayload) that
// want to show the result; other callers just ignore the return value.
async function postJson(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    return { ok: res.ok, status: res.status, statusText: res.statusText, body };
  } catch {
    // CORS/network failure — most LeadConnector hooks accept a no-cors
    // fire-and-forget POST even when a normal fetch can't read the
    // response, so still attempt delivery before giving up.
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { ok: null, status: null, statusText: "sent no-cors (response unreadable)", body: "" };
    } catch (e2) {
      return { ok: false, status: null, statusText: e2?.message || "network error", body: "" };
    }
  }
}

/**
 * Look up `settingKey`'s URL and POST `payload` to it. Silent no-op (just a
 * console.warn) if the setting is unset — lets every new event type ship
 * without breaking anything for admins who haven't configured a URL yet.
 */
export async function sendHighLevelEvent(settingKey, payload) {
  const url = await getIntegrationSettingValue(settingKey);
  if (!url) {
    console.warn(`[HighLevel] ${settingKey} has no webhook URL configured — skipping send for event "${payload?.event}". Set one on the Integration Settings page.`);
    return { ok: false, skipped: true };
  }
  const result = await postJson(url, payload);
  if (result.ok === false) {
    console.error(`[HighLevel] ${settingKey} send failed:`, result.statusText, result.body);
  }
  return result;
}

/**
 * Same as sendHighLevelEvent, but posts straight to `url` rather than
 * looking one up by key — for the Settings page's Test Send button, which
 * needs to test whatever's currently typed into the field, including
 * before it's been saved.
 */
export async function sendHighLevelEventToUrl(url, payload) {
  if (!url) return { ok: false, skipped: true };
  return postJson(url, payload);
}

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

function buildClientBlock(clientRow) {
  const { service_id, service_label } = resolveService(clientRow);
  return {
    id: clientRow.id,
    full_name: clientRow.full_name || "",
    email: clientRow.email || "",
    phone: clientRow.phone || "",
    admin_id: clientRow.admin_id || null,
    company_id: clientRow.company_id || null,
    company_name: clientRow.company_name || "",
    agent_id: clientRow.agent_id || null,
    agent_name: clientRow.agent || "",
    service_id,
    service_label,
  };
}

async function fetchClientForCsEvent(clientId) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, full_name, email, phone, admin_id, company_id, company_name, agent_id, agent, service_id, dispute_method")
    .eq("id", clientId)
    .single();
  if (error || !data) return null;
  return data;
}

const CS_WEBHOOK_KEY = "highlevel_cs_webhook_url";

/**
 * "client_completed" — a client's file is fully done. Distinct from (and
 * sent in addition to) completionWebhook.js's own client_completed event:
 * that one goes to the existing "Bureau Completion Webhook" GHL workflow
 * this app already had; this one goes to the new CS Dashboard Events
 * webhook so a separate GHL automation can react to CS-relevant
 * completions without being entangled with the dispute-cycle workflow.
 */
export async function sendClientDoneEvent(clientId, extra = {}) {
  const clientRow = await fetchClientForCsEvent(clientId);
  if (!clientRow) return { ok: false, skipped: true };
  return sendHighLevelEvent(CS_WEBHOOK_KEY, {
    event: "client_completed",
    client: buildClientBlock(clientRow),
    ts: new Date().toISOString(),
    ...extra,
  });
}

/** "needs_more_documents" — CS Dashboard File Status shows this client missing a required doc. */
export async function sendNeedsMoreDocumentsEvent(clientId, extra = {}) {
  const clientRow = await fetchClientForCsEvent(clientId);
  if (!clientRow) return { ok: false, skipped: true };
  return sendHighLevelEvent(CS_WEBHOOK_KEY, {
    event: "needs_more_documents",
    client: buildClientBlock(clientRow),
    ts: new Date().toISOString(),
    ...extra,
  });
}

/** "processing_stage_changed" — clients.processing_stage was just set to a new value. */
export async function sendProcessingStageChangedEvent(clientId, { previousStage, newStage } = {}) {
  const clientRow = await fetchClientForCsEvent(clientId);
  if (!clientRow) return { ok: false, skipped: true };
  return sendHighLevelEvent(CS_WEBHOOK_KEY, {
    event: "processing_stage_changed",
    client: buildClientBlock(clientRow),
    previous_stage: previousStage || null,
    new_stage: newStage || null,
    ts: new Date().toISOString(),
  });
}

/** "payment_status_changed" — clients.is_paid just flipped (currently only fired on becoming true). */
export async function sendPaymentStatusChangedEvent(clientId, { isPaid, amount } = {}) {
  const clientRow = await fetchClientForCsEvent(clientId);
  if (!clientRow) return { ok: false, skipped: true };
  return sendHighLevelEvent(CS_WEBHOOK_KEY, {
    event: "payment_status_changed",
    client: buildClientBlock(clientRow),
    is_paid: !!isPaid,
    amount: amount ?? null,
    ts: new Date().toISOString(),
  });
}

// Sample payload shown/sent by the Integration Settings page's Test Send
// button for each key — realistic shape, obviously-fake data, so staff can
// confirm delivery + build their GHL workflow's field mapping without
// needing a real client on hand.
const SAMPLE_CLIENT_BLOCK = {
  id: "00000000-0000-0000-0000-000000000000",
  full_name: "Test Client",
  email: "test.client@example.com",
  phone: "555-000-1234",
  admin_id: null,
  company_id: null,
  company_name: "Sample Company",
  agent_id: null,
  agent_name: "Sample Agent",
  service_id: "credit_repair",
  service_label: "Credit Repair",
};

export const TEST_PAYLOADS = {
  highlevel_cs_webhook_url: {
    event: "client_completed",
    client: SAMPLE_CLIENT_BLOCK,
    ts: new Date(0).toISOString(),
    note: "This is a test payload sent from the Integration Settings page.",
  },
  highlevel_completion_webhook_url: {
    event: "client_completed",
    client: SAMPLE_CLIENT_BLOCK,
    statuses: { exp: "done", tu: "done", eq: "na" },
    completed: ["exp", "tu"],
    reason: "test_send",
    completed_at: new Date(0).toISOString(),
  },
  highlevel_document_logged_webhook_url: {
    event: "document_logged",
    client_id: SAMPLE_CLIENT_BLOCK.id,
    client: { full_name: SAMPLE_CLIENT_BLOCK.full_name, email: SAMPLE_CLIENT_BLOCK.email, phone: SAMPLE_CLIENT_BLOCK.phone },
    admin_id: null,
    note: "Test payload from Integration Settings page.",
    callback_date: new Date(0).toISOString().split("T")[0],
    bureaus: { EXP: true, TU: false, EQ: false },
    created_at_est: new Date(0).toISOString().split("T")[0],
  },
  highlevel_bureau_exp_webhook_url: { bureau: "exp", ts: new Date(0).toISOString(), client_id: SAMPLE_CLIENT_BLOCK.id, note: "Test payload." },
  highlevel_bureau_tu_webhook_url: { bureau: "tu", ts: new Date(0).toISOString(), client_id: SAMPLE_CLIENT_BLOCK.id, note: "Test payload." },
  highlevel_bureau_eq_webhook_url: { bureau: "eq", ts: new Date(0).toISOString(), client_id: SAMPLE_CLIENT_BLOCK.id, note: "Test payload." },
  highlevel_individual_webhook_url: {
    event: "test_send",
    client: SAMPLE_CLIENT_BLOCK,
    ts: new Date(0).toISOString(),
  },
};

/**
 * Send whatever payload TEST_PAYLOADS defines for `settingKey` to `url`
 * (the Settings page passes the CURRENT input value, which may not be
 * saved yet). Returns the raw result plus the exact payload sent, so the
 * page can render both.
 */
export async function sendTestPayload(settingKey, url) {
  const payload = { ...(TEST_PAYLOADS[settingKey] || { event: "test_send", ts: new Date().toISOString() }), ts: new Date().toISOString() };
  const result = await sendHighLevelEventToUrl(url, payload);
  return { ...result, payload };
}
