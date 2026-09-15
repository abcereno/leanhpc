// src/utils/processingStage.js
//
// The "Processing" step on the Operational Timeline (ClientSummaryModal.jsx)
// used to only ever read "Pending" / "In Progress" / "Completed" — no way
// for staff to say WHERE in the dispute cycle a file actually sits, so a
// partner staring at "In Progress" for three weeks had no idea whether a
// letter had even gone out yet. This adds a manually-selected stage on top
// of that, so there's no ambiguity (and, per the ask, no free-text typos
// standing in for it — a fixed dropdown instead).
//
// Deliberately simple, matching every other Operational Timeline step
// (Payment/Documents/Complete): one current value (`clients.processing_stage`)
// + one `processing_stage_updated_at` timestamp for when it last changed,
// not a full history table. See sql/add_processing_stage.sql.

export const PROCESSING_STAGES = [
  { id: "letter_sent", label: "Letter Created & Sent" },
  { id: "awaiting_bureaus", label: "Awaiting Bureaus" },
  { id: "bureau_response_received", label: "Bureau Response Received" },
  { id: "re_dispute_in_progress", label: "Re-Dispute in Progress" },
  { id: "results_finalizing", label: "Results Being Finalized" },
];

const LABEL_BY_ID = PROCESSING_STAGES.reduce((acc, s) => {
  acc[s.id] = s.label;
  return acc;
}, {});

/** Human-readable label for a stored processing_stage value, or null if unset/unrecognized. */
export function processingStageLabel(stageId) {
  if (!stageId) return null;
  return LABEL_BY_ID[stageId] || null;
}
