// src/utils/services.js
//
// Frontend mirror of sql/add_services.sql's `services` table. Fixed,
// hardcoded reference list (not fetched, not admin-manageable) — there are
// only 4 services and they rarely change, so this avoids a round trip on
// every add-client form's dropdown. If a new service is ever added, update
// BOTH this list and the seed rows in sql/add_services.sql.
//
// `clients.dispute_method` (free text, casing inconsistent) is still the
// column every existing form/filter reads and writes — this file doesn't
// replace it, it just gives write sites a way to also populate the new
// clients.service_id FK in lockstep. See utils/clientDuplicateRound.js's
// insertClientRecord() for the main write-side usage.

export const SERVICES = [
  { id: "inquiry_deletion", disputeMethod: "inquiry deletion", label: "Inquiry Deletion" },
  // Label renamed to "Case Management" per business terminology — id and
  // disputeMethod values intentionally left as "credit_repair"/"credit
  // repair" so no DB data or existing filters need to change, just the
  // human-facing text (which flows from this one place everywhere).
  { id: "credit_repair", disputeMethod: "credit repair", label: "Case Management" },
  { id: "fraud_alert_removal", disputeMethod: "Fraud Alert removal", label: "Fraud Alert Removal" },
  { id: "personal_identifiers", disputeMethod: "Personal Identifiers", label: "Personal Identifiers" },
];

export function serviceById(id) {
  return SERVICES.find((s) => s.id === id) || null;
}

/** Case/whitespace-insensitive match against a legacy dispute_method string
 * — production data has inconsistent casing ("credit repair" vs
 * "Fraud Alert removal"), so this is never an exact === comparison. */
export function serviceByDisputeMethod(disputeMethod) {
  const norm = String(disputeMethod || "").trim().toLowerCase();
  if (!norm) return null;
  return SERVICES.find((s) => s.disputeMethod.toLowerCase() === norm) || null;
}

/** What write sites actually call: given whatever dispute_method string is
 * about to be saved, returns the service_id to save alongside it (or null
 * if it doesn't match any known service — e.g. blank/legacy typo data). */
export function deriveServiceId(disputeMethod) {
  return serviceByDisputeMethod(disputeMethod)?.id ?? null;
}

/** What read sites should call instead of comparing `dispute_method`
 * directly: the client's `service_id` if it's been backfilled, or a
 * derived one from its legacy `dispute_method` string otherwise. Covers any
 * row inserted before sql/add_services.sql ran, or during the brief window
 * between shipping this code and actually running that migration. Accepts
 * a client row (or any partial object with service_id/dispute_method). */
export function resolveServiceId(client) {
  return client?.service_id ?? deriveServiceId(client?.dispute_method);
}

/** What display sites should call instead of rendering `dispute_method`
 * directly — resolves the client's service and returns its human-facing
 * label (e.g. "Case Management" instead of the raw stored "credit repair"
 * string). Falls back to the raw dispute_method text for any value that
 * doesn't match a known service (typo/legacy data), and to `fallback`
 * (default "N/A") if there's nothing at all. */
export function serviceLabel(client, fallback = "N/A") {
  const id = resolveServiceId(client);
  const label = serviceById(id)?.label;
  return label || client?.dispute_method || fallback;
}
