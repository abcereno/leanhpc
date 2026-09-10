// src/utils/timelineGapNotes.js
//
// Shared helpers for tagging a client_notes row (sql/client_notes.sql,
// gap_key column added by sql/add_client_timeline_gap_notes.sql) as the
// reason for a gap on the Operational Timeline (ClientSummaryModal.jsx)
// rather than an ordinary Manager Note. gap_key is a stable slug built
// from the two step labels on either side of the gap (e.g.
// "payment__documents") so a note stays attached to the same logical
// transition even if the underlying dates shift slightly on a resync.
//
// Shared with ManagerNotesPanel.jsx so a gap-reason note (they live in the
// same client_notes table/thread) reads sensibly wherever it's displayed,
// not just inside the timeline itself.

export const GAP_REASON_PRESETS = [
  "Docs not received",
  "Client unresponsive",
  "Partner delay",
  "Awaiting internal review",
  "Holiday / weekend delay",
];

export function gapKeyFor(fromLabel, toLabel) {
  return `${fromLabel}__${toLabel}`.toLowerCase().replace(/\s+/g, "_");
}

// "payment__documents" -> "Payment → Documents"
export function gapKeyLabel(gapKey) {
  if (!gapKey) return "";
  const [from, to] = gapKey.split("__");
  const cap = (s) =>
    (s || "")
      .split("_")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
  return `${cap(from)} → ${cap(to)}`;
}
