// src/utils/partnerClientEdit.js
//
// Single write path for company/partner portal edits to a client's contact
// info (see ClientProfilePage.jsx's Edit Contact Info modal). Stamps who
// made the change and when (partner_updated_at/by/by_name — see
// sql/add_partner_client_edits.sql) so admin's ClientHeader.jsx can show a
// "last edited by partner" marker instead of a silent, unattributed update
// to the same clients row staff already read.
//
// Contact info only (email/phone/address) — deliberately not identity
// fields (DOB, SSN) or anything that drives workflow (dispute_method,
// agent_id, etc.). See utils/clientDuplicateRound.js#insertClientRecord for
// the sibling "insert" version of this same graceful-degradation pattern.
//
// NOTE: email is also used elsewhere as a de-facto client-lookup key (see
// utils/clientDuplicateRound.js's header comment — e.g. an Individual
// Portal login linked to its client row by email). Editing it here doesn't
// update any such link; if that becomes a real problem, this is the file to
// add a guard to.

import { supabase } from "../supabaseClient";

/**
 * Updates a client's contact info as a company-portal user. `fields` is any
 * subset of `{ email, phone, address }`. `editor` is `{ id, name }` for the
 * company_user_profiles row making the change (used for the partner_updated_*
 * marker columns — omit/pass null to skip attribution).
 *
 * Degrades gracefully if sql/add_partner_client_edits.sql hasn't been run
 * yet against this database: retries without the marker columns so the
 * actual contact-info edit still saves rather than failing outright.
 * Returns `{ data, error }`.
 */
export async function updateClientContactInfo(clientId, fields, editor = null) {
  let payload = { ...fields };
  if (editor) {
    payload = {
      ...payload,
      partner_updated_at: new Date().toISOString(),
      partner_updated_by: editor.id || null,
      partner_updated_by_name: editor.name || null,
    };
  }

  let { data, error } = await supabase
    .from("clients")
    .update(payload)
    .eq("id", clientId)
    .select()
    .maybeSingle();

  if (error && /partner_updated_(at|by|by_name)/i.test(error.message || "")) {
    console.warn("clients.partner_updated_* not found (run sql/add_partner_client_edits.sql) — saving without the marker.");
    const { partner_updated_at, partner_updated_by, partner_updated_by_name, ...rest } = payload;
    ({ data, error } = await supabase
      .from("clients")
      .update(rest)
      .eq("id", clientId)
      .select()
      .maybeSingle());
  }

  return { data, error };
}
