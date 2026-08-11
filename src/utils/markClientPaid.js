// src/utils/markClientPaid.js
//
// The actual "mark as paid" business logic, extracted out of
// useClientActions.js#markAsPaid so it can be called from more than one
// place without duplicating it — specifically, the new admin "New Client
// Leads" page (unpaid clients awaiting review, see AdminSidebar.jsx) needs
// the exact same behavior a single client's profile page gets: resetting
// bureau statuses, enrolling in Document Routing, and firing the payment
// webhooks. Reusing this instead of a plain `.update({ is_paid: true })`
// matters — a client marked paid any other way (e.g. the existing "Edit
// Paid Date" modal in AdminClientList.jsx, which only touches paid_at)
// never gets a Document Routing round or the payment webhook, and quietly
// never enters the self-healing docs/calls workflow at all.
import { supabase } from "../supabaseClient";
import { sendWebhook } from "../hooks/useWebhookSender";

const PAID_WEBHOOKS = [
  "https://services.leadconnectorhq.com/hooks/rqr5oOzXxiHjh8wSS7T2/webhook-trigger/775e674e-e9dd-43df-852f-574865edcc84",
  "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/236315bf-1d68-419b-b8aa-f6afaafcc39c",
];

/**
 * Marks a client paid: resets bureau statuses to NEW/incomplete, creates
 * the client's first Document Routing round if one doesn't already exist,
 * and fires the paid webhooks. `client` needs at least `full_name`, `email`,
 * `phone`, `agent`, `admin_id`. Returns `{ error }` (never throws — webhook
 * failures are logged, not surfaced, matching the original behavior in
 * useClientActions.js).
 */
export async function markClientPaid(clientId, client, { triggerSource = "manual_mark_paid" } = {}) {
  const now = new Date().toISOString();

  const { error } = await supabase.from("clients").update({
    is_paid: true, paid_at: now,
    exp_status: "NEW", tu_status: "NEW", eq_status: "NEW",
    exp_completed: false, tu_completed: false, eq_completed: false,
  }).eq("id", clientId);

  if (error) return { error };

  const { count } = await supabase.from("document_routing")
    .select("*", { count: "exact", head: true }).eq("client_id", clientId);
  if (count === 0) {
    await supabase.from("document_routing").insert({
      client_id: clientId, round_count: 1, status: "PENDING",
      assigned_admin_id: client.admin_id || null,
    });
  }

  // Re-fetched fresh rather than trusting client.company_id — callers don't
  // all select the same columns (matches the original behavior in
  // useClientActions.js#markAsPaid).
  const { data: freshClient } = await supabase.from("clients").select("company_id").eq("id", clientId).maybeSingle();

  let companyEmail = null;
  if (freshClient?.company_id) {
    const { data: co } = await supabase.from("companies").select("contact_email").eq("id", freshClient.company_id).maybeSingle();
    companyEmail = co?.contact_email ?? null;
  }

  const guaranteedClientEmail = client.email || `quickimport-${clientId.substring(0, 8)}@pending.com`;
  const payload = { ...client, email: guaranteedClientEmail, is_paid: true, paid_at: now, trigger_source: triggerSource, company_email: companyEmail };

  await Promise.all(PAID_WEBHOOKS.map((url) =>
    sendWebhook(payload, url).catch((e) => console.error(`Webhook failed: ${e.message}`))
  ));

  return { error: null };
}
