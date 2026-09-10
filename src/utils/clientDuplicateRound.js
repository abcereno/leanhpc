// src/utils/clientDuplicateRound.js
//
// Shared by every "add client" form (AddClientSidebar.jsx, SmartIdiQModal.jsx,
// AddClientFormStandard.jsx, AddClientForm.jsx, AddClientModal.jsx,
// BrokerAddClientForm.jsx) so the duplicate-email/round rule can't be
// bypassed by using a different entry point, and so all six define "next
// round" identically.
//
// Why this exists: email is relied on as a de-facto unique identifier in a
// few places (e.g. IndividualDashboard.jsx linking a portal login to its
// client row by email). A returning client starting a new engagement needs
// a NEW clients row — reusing the old one would overwrite their previous
// round's thread.json/progress/documents — but two rows sharing an email
// with no way to tell them apart, or worse an accidental duplicate from a
// typo/re-submission, is exactly the bug this exists to prevent.

import { supabase } from "../supabaseClient";
import { deriveServiceId } from "./services";

/**
 * All clients rows sharing this email (case-insensitive), latest round
 * first. Returns [] on lookup failure or no matches — never throws, since
 * this only ever gates a UI confirmation, not the actual save.
 */
export async function findClientRoundsByEmail(email) {
  const cleaned = String(email || "").trim().toLowerCase();
  if (!cleaned) return [];

  const { data, error } = await supabase
    .from("clients")
    .select("id, full_name, dispute_round")
    .ilike("email", cleaned)
    .order("dispute_round", { ascending: false });

  if (error) {
    console.warn("Could not check for duplicate client email:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Call this before inserting a new client row. If the email already
 * belongs to an existing client, warns the admin (name + current round)
 * and asks for confirmation before proceeding — the "warn, then confirm"
 * behavior, not silent auto-duplication and not a hard block.
 *
 * Returns the dispute_round to use for the insert (1 for a brand-new
 * email), or `null` if the admin canceled — callers must abort the
 * submission when they get `null` back, not fall through to inserting
 * with a default round.
 *
 * `confirmFn` is the `confirm` function from useConfirm()
 * (components/shared/ui/ConfirmDialog.jsx) — this file is a plain utility,
 * not a hook/component, so it can't call useConfirm() itself; every
 * add-client form that calls this passes its own `confirm` through.
 * Defaults to window.confirm so this still degrades safely if a caller
 * forgets to pass one, rather than throwing.
 */
export async function resolveRoundForNewClient(email, confirmFn = window.confirm) {
  const existing = await findClientRoundsByEmail(email);
  if (existing.length === 0) return 1;

  const latest = existing[0];
  const currentRound = latest.dispute_round || 1;
  const nextRound = currentRound + 1;

  const message =
    `This email is already used by ${latest.full_name || "an existing client"} ` +
    `(currently Round ${currentRound}).\n\n` +
    `Click OK to create Round ${nextRound} for this client, or Cancel to stop and look them up instead.`;

  // confirmFn is either window.confirm (sync, returns boolean) or the
  // ConfirmDialog confirm() (async, resolves to a boolean) — awaiting a
  // plain boolean is a no-op, so this line works for both.
  const proceed = await confirmFn(message);

  return proceed ? nextRound : null;
}

/**
 * Insert a new clients row. Every add-client form calls this instead of
 * `supabase.from("clients").insert(...)` directly, because all 6 forms now
 * put `dispute_round` in the payload — if sql/add_dispute_round.sql hasn't
 * been run against this database yet, that column doesn't exist and the
 * insert would fail outright for every form at once. Centralizing the
 * fallback here means it only has to be written once (same reasoning as
 * the countedAtAvailableRef pattern in ClientSubmissionListener.jsx for
 * reads — this is the write-side equivalent).
 *
 * Also auto-derives `service_id` from whatever `dispute_method` the caller
 * passed in (see utils/services.js) unless the caller already set one
 * explicitly — this is the one place that needs to know about the new
 * services table so none of the 6 forms have to be touched individually
 * (see sql/add_services.sql for why dispute_method itself is left alone).
 *
 * `options.select`, if given, is applied as `.select(select).single()`,
 * matching how most of the forms already chained their insert. Returns
 * `{ data, error }` either way.
 */
export async function insertClientRecord(payload, options = {}) {
  const { select } = options;

  const runInsert = (p) => {
    let query = supabase.from("clients").insert(p);
    return select ? query.select(select).single() : query;
  };

  let workingPayload = { ...payload };
  if ("dispute_method" in workingPayload && !("service_id" in workingPayload)) {
    const serviceId = deriveServiceId(workingPayload.dispute_method);
    if (serviceId) workingPayload.service_id = serviceId;
  }

  let { data, error } = await runInsert(workingPayload);

  // Defensive: sql/add_dispute_round.sql and/or sql/add_services.sql may not
  // have been run yet against this database — degrade gracefully (insert
  // without the missing column) rather than failing every add-client form
  // at once.
  for (const col of ["dispute_round", "service_id"]) {
    if (error && col in workingPayload && new RegExp(col, "i").test(error.message || "")) {
      console.warn(`clients.${col} not found (run the matching sql/*.sql migration) — inserting without it.`);
      const { [col]: _omit, ...rest } = workingPayload;
      workingPayload = rest;
      ({ data, error } = await runInsert(workingPayload));
    }
  }

  return { data, error };
}
