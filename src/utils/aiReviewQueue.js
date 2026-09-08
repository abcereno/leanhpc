// src/utils/aiReviewQueue.js
//
// Writes rows into ai_review_queue (see sql/add_ai_review_queue.sql)
// whenever classify-inquiries's own deterministic guard downgraded a
// model-proposed "linked"/"associated" call back to "non-linked" — tagged
// `_classifierGuard` on the inquiry object by
// supabase/functions/classify-inquiries/index.ts's applyDeterministicGuard.
//
// Called once from each of the two live classification save paths
// (UploadReportForm.jsx's handleSave, SmartIdiQModal.jsx's
// commonUpdateAndUpload) right after their thread.json upload succeeds —
// same classified object, same shape, so one shared scan instead of two
// near-identical copies. Deliberately NOT called from Fetch3bModal.jsx/
// ParseRreportModal.jsx, which no longer classify at all (everything lands
// "non-linked" via their own fallback — see that change's own comments),
// or from SmartIdiQModal's still-classifying-but-untouched design — this
// only needs to run wherever classifyInquiries()/the edge function actually
// executes, which is exactly these two places.
//
// Best-effort: a failure here (migration not run yet, RLS not applied,
// network hiccup) is logged and swallowed rather than thrown — the
// thread.json save this runs after is the save that actually matters to
// the person using the import flow, and shouldn't be blocked by a
// secondary queue write.

const BUREAU_LABEL = { experian: "Experian", transunion: "TransUnion", equifax: "Equifax" };

/**
 * `classified` is the same {accounts, experian, transunion, equifax} shape
 * classify-inquiries returns (and thread.json stores) — each inquiry item
 * carrying `_classifierGuard` when the deterministic guard fired.
 */
export async function flagGuardedInquiries(supabase, clientId, classified) {
  if (!supabase || !clientId || !classified) return { flagged: 0 };

  const rows = [];
  for (const key of Object.keys(BUREAU_LABEL)) {
    const list = Array.isArray(classified[key]) ? classified[key] : [];
    for (const inq of list) {
      if (!inq?._classifierGuard) continue;
      rows.push({
        client_id: clientId,
        bureau: BUREAU_LABEL[key],
        creditor: inq.creditor || inq.Creditor || null,
        inquiry_date: inq.date || inq.Date || null,
        guard_reason: String(inq._classifierGuard),
      });
    }
  }

  if (rows.length === 0) return { flagged: 0 };

  try {
    // Insert-only upsert — a row a reviewer already resolved/dismissed
    // stays that way on the next re-classification of the same
    // (client, bureau, creditor, date) instead of silently reopening.
    // ignoreDuplicates skips existing rows entirely rather than updating
    // them, which is exactly that behavior.
    const { error } = await supabase
      .from("ai_review_queue")
      .upsert(rows, { onConflict: "client_id,bureau,creditor,inquiry_date", ignoreDuplicates: true });

    if (error) {
      // Same "migration might not be run yet" defensive pattern used
      // throughout this project — degrade silently rather than break the
      // classification save that just succeeded.
      console.warn("[aiReviewQueue] Could not write to ai_review_queue (has sql/add_ai_review_queue.sql been run?):", error.message);
      return { flagged: 0, error };
    }
    return { flagged: rows.length };
  } catch (e) {
    console.warn("[aiReviewQueue] Unexpected error flagging guarded inquiries:", e);
    return { flagged: 0, error: e };
  }
}
