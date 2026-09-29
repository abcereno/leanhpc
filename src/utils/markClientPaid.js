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
import { SERVICES } from "./services";
import { maybeAssignToRoselle } from "./fileReadiness";
import { sendPaymentStatusChangedEvent, sendHighLevelEvent } from "./highlevelWebhook";

// URLs now live in integration_settings ("Mark Paid Webhook 1"/"Mark Paid
// Webhook 2" on the admin Integration Settings page) instead of hardcoded
// here — two distinct GHL destinations that both fire on every paid event.
const PAID_WEBHOOK_KEYS = ["highlevel_paid_webhook_1_url", "highlevel_paid_webhook_2_url"];

/**
 * Marks a client paid: resets bureau statuses to NEW/incomplete, creates
 * the client's first Document Routing round if one doesn't already exist,
 * fires the paid webhooks, and — when `amount` is given — records the
 * payment in `incomes` so it shows up on the Financial Dashboard without a
 * separate manual "Add Income" step. `client` needs at least `full_name`,
 * `email`, `phone`, `agent`, `admin_id`. Returns `{ error }` (never throws —
 * webhook failures are logged, not surfaced, matching the original
 * behavior in useClientActions.js).
 *
 * `amount` is optional here (not every caller has collected one yet — see
 * each call site's own required-field validation), but every UI surface
 * that lets a human manually mark a client paid should be requiring and
 * passing it. AdminPaymentVerifications.jsx already has a verified amount
 * on the payment_verifications row itself, so it passes that straight
 * through instead of asking a second time.
 */
export async function markClientPaid(clientId, client, { triggerSource = "manual_mark_paid", amount = null } = {}) {
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

  // Auto-record the payment as income — best-effort: a failure here
  // shouldn't undo the paid flag or block the rest of this function, so
  // it's logged rather than thrown (same non-throwing contract as the
  // webhook sends below).
  const numericAmount = Number(amount);
  if (Number.isFinite(numericAmount) && numericAmount > 0) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const service = SERVICES.find((s) => s.disputeMethod?.toLowerCase() === String(client.dispute_method || "").toLowerCase());
      const { error: incomeErr } = await supabase.from("incomes").insert({
        client_id: clientId,
        employee_id: userData?.user?.id || null,
        amount: numericAmount,
        date: now.slice(0, 10),
        source: "Client Payment",
        category: service?.label || null,
        notes: `Auto-recorded when marked paid (${triggerSource}).`,
      });
      if (incomeErr) console.error("Failed to auto-record income for paid client:", incomeErr.message);
    } catch (incomeErr) {
      console.error("Unexpected error auto-recording income for paid client:", incomeErr);
    }
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

  await Promise.all(PAID_WEBHOOK_KEYS.map((key) => sendHighLevelEvent(key, payload)));

  // Fire-and-forget: this is the ONE shared path every "mark paid" flow in
  // the app already goes through (see this file's own header comment on
  // why that matters) — the single place to catch an LTOS File Status file
  // becoming fully ready the moment payment clears, without having to hook
  // every individual "mark paid" button separately. No-op for non-LTOS
  // clients or ones still missing a document (see utils/fileReadiness.js).
  maybeAssignToRoselle(clientId);

  // "payment_status_changed" to the new CS Dashboard Events webhook — this
  // is the one shared path every "mark paid" flow in the app goes through
  // (see this file's header comment), so it's the single place to fire
  // this rather than hooking every individual "mark paid" button.
  sendPaymentStatusChangedEvent(clientId, { isPaid: true, amount: Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount : null });

  return { error: null };
}
