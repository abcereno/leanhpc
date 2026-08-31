// src/utils/overrideDocumentValidation.js
//
// Shared "a human is manually overriding the AI's validation result"
// write — used by AlignmentCheckPanel.jsx's Override dropdown and
// CoverLetterAssets.jsx's per-document override button, so the actual
// column payload and RLS-no-op detection (same .select("id")-then-check-
// row-count pattern every client_documents write in this codebase
// already uses) lives in exactly one place instead of two copies that
// could drift apart.
//
// Exists because OCR on a busy/watermarked scan will never be 100%
// reliable (e.g. a diagonal state seal crossing the expiration-date
// digits), so admins need a way to correct a wrong AI call without it
// reverting on the next re-check. This bypasses the AI entirely and
// records who did it and when, so a manual override is never mistaken
// for a fresh AI confirmation later.
import { supabase } from "../supabaseClient";

export const OVERRIDE_STATUS_LABELS = {
  valid: "Valid",
  expired: "Expired",
  invalid: "Invalid",
  needs_review: "Needs Review",
};

/**
 * Matches the row either by `id` (AlignmentCheckPanel.jsx already has the
 * full row) or by `{clientId, fileName}` (CoverLetterAssets.jsx's `assets`
 * state doesn't carry a row id — same lookup its own runValidation()
 * already uses). Exactly one of the two lookup modes should be given.
 *
 * Returns `{ success: true, label, validation_details, notes }` on success,
 * or `{ success: false, error }` — never throws, matching every other
 * client_documents write in this codebase.
 */
export async function overrideDocumentValidation({ id, clientId, fileName, status, adminName, previousNotes, previousDetails }) {
  const label = OVERRIDE_STATUS_LABELS[status] || status;
  const notes = `Manually marked "${label}" by ${adminName || "an admin"} on ${new Date().toLocaleString()}.${previousNotes ? ` Previous AI reasoning: ${previousNotes}` : ""}`;
  const validation_details = {
    ...(previousDetails || {}),
    manualOverride: true,
    overriddenBy: adminName || null,
    overriddenAt: new Date().toISOString(),
  };

  let query = supabase.from("client_documents").update({
    validation_status: status,
    validation_notes: notes,
    validation_details,
    validated_at: new Date().toISOString(),
  });
  query = id ? query.eq("id", id) : query.eq("client_id", clientId).eq("file_name", fileName);

  const { data, error } = await query.select("id");

  if (error || !data || data.length === 0) {
    return {
      success: false,
      error: error?.message || "0 rows were updated — likely a missing Row Level Security UPDATE policy on client_documents.",
    };
  }
  return { success: true, label, validation_details, notes };
}
