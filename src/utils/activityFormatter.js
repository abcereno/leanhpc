// src/utils/activityFormatter.js
//
// Turns a raw activity_logs row into the emoji + one-line phrasing the
// spec's "Live Activity Feed" example shows. Grounded in the action_type
// strings actually passed to logAction() today (grepped across src/) —
// nothing here is invented. See the ACTION_MAP keys for the full current
// list; the `default` case covers any action_type not explicitly mapped.
//
// Extensibility: once Priority 1 (Authorization) and Priority 2 (Count
// Review) ship, their logAction() calls (e.g. an
// "approve_authorization_override" or "request_count_review" action) just
// need an entry added below — the feed UI itself doesn't need to change.

const ACTION_MAP = {
  create_client: { emoji: "🟢", text: (u, t) => `${u} added a new client${t ? ` — ${t}` : ""}.` },
  create_client_portal: { emoji: "🔵", text: (u, t) => `${u} added a new client via partner portal${t ? ` — ${t}` : ""}.` },
  reset_client: { emoji: "🟡", text: (u, t) => `${u} reset the inquiry count for ${t || "a client"}.` },
  update_thread: { emoji: "🟢", text: (u, t) => `${u} updated inquiry counts for ${t || "a client"}.` },
  generate_letters: { emoji: "🟢", text: (u, t) => `${u} generated dispute letters for ${t || "a client"}.` },
  delete_client: { emoji: "🔴", text: (u, t) => `${u} deleted ${t || "a client"}.` },
  grab_client: { emoji: "🔵", text: (u, t) => `${u} claimed ${t || "a client"}.` },
  verify_payment: { emoji: "🟢", text: (u, t) => `${u} verified payment${t ? ` for ${t}` : ""}.` },
  bulk_update_clients: { emoji: "🟢", text: (u) => `${u} bulk-updated clients.` },
  upload_asset: { emoji: "🟠", text: (u, t) => `${u} uploaded an asset for ${t || "a client"}.` },
  remove_asset: { emoji: "🟠", text: (u, t) => `${u} removed an asset for ${t || "a client"}.` },
  update_client_info: { emoji: "🔵", text: (u, t) => `${u} updated info for ${t || "a client"}.` },
  upload_document: { emoji: "🟠", text: (u, t) => `${u} uploaded documents for ${t || "a client"}.` },
  delete_document: { emoji: "🔴", text: (u, t) => `${u} deleted a document for ${t || "a client"}.` },
  delete_all_documents: { emoji: "🔴", text: (u, t) => `${u} deleted all documents for ${t || "a client"}.` },
  "Counted Inquiries": { emoji: "🟢", text: (u, t) => `${u} counted inquiries for ${t || "a client"}.` },
  generate_invoice: { emoji: "🟢", text: (u, t) => `${u} generated an invoice for ${t || "a client"}.` },
  fetch_3b: { emoji: "🟢", text: (u, t) => `${u} pulled a 3-bureau report for ${t || "a client"}.` },
  update_idiq: { emoji: "🟢", text: (u, t) => `${u} updated IdentityIQ data for ${t || "a client"}.` },
  fetch_idiq: { emoji: "🟢", text: (u, t) => `${u} pulled an IdentityIQ report for ${t || "a client"}.` },
  fetch_smartcredit: { emoji: "🟢", text: (u, t) => `${u} pulled a SmartCredit report for ${t || "a client"}.` },
  update_ssn: { emoji: "🔵", text: (u, t) => `${u} updated SSN records for ${t || "a client"}.` },
  reveal_ssn: { emoji: "🔵", text: (u, t) => `${u} viewed SSN for ${t || "a client"}.` },
};

export function formatActivityEvent(row) {
  const user = row.user_name || "Someone";
  const target = row.target_name || null;
  const mapping = ACTION_MAP[row.action_type];

  if (mapping) {
    return { emoji: mapping.emoji, text: mapping.text(user, target) };
  }

  return {
    emoji: "🔵",
    text: `${user} performed "${row.action_type}"${target ? ` on ${target}` : ""}.`,
  };
}
