// src/utils/classifyInquiries.js
//
// Thin wrapper around the classify-inquiries Edge Function, shared by
// every admin-side caller (Fetch3bModal.jsx, ParseRreportModal.jsx,
// SmartIdiQModal.jsx) so name-matching accuracy improvements — the
// lender alias table below, the deterministic date-window guard in the
// Edge Function itself — apply everywhere consistently instead of
// drifting between call sites that each built their own fetch.
//
// Deliberately NOT used by reportAutoImport.js or the partner-facing
// add-client forms (AddClientModal.jsx, AddClientForm.jsx,
// NewLeadForm.jsx) — those intentionally stay manual-review-only.
//
// Never throws — on any failure (network error, non-success response) it
// returns the original unclassified arrays untouched, so a temporary
// classify-inquiries outage degrades to the old "everything non-linked,
// human reviews it" behavior instead of blocking the import.
import { supabase } from "../supabaseClient";

// Fetches the master lender/alias reference table (sql/add_lender_aliases.sql)
// so classify-inquiries can resolve name variants ("BK OF AMER", "JPMCB
// CARD", "SYNCB/CARECR") to a canonical lender identity instead of relying
// on the model's own judgment call on every request. Never throws — a
// missing/unmigrated table (or a transient fetch failure) just means
// classify-inquiries falls back to its own built-in name matching, same as
// before this table existed.
export async function fetchLenderAliases() {
  try {
    const { data, error } = await supabase
      .from("lender_aliases")
      .select("canonical_name, alias, category, requires_manual_review, related_canonical_name");
    if (error) {
      console.warn("Failed to load lender_aliases (run sql/add_lender_aliases.sql?):", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn("Failed to load lender_aliases:", err);
    return [];
  }
}

export async function classifyInquiries({ accounts, experian, transunion, equifax, lenderAliases }) {
  try {
    const aliases = lenderAliases ?? (await fetchLenderAliases());
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-inquiries`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ accounts, experian, transunion, equifax, lenderAliases: aliases }),
      }
    );
    const classified = await res.json();
    if (!classified?.success) {
      console.warn("classify-inquiries returned an error, keeping unclassified data:", classified?.error);
      return { success: false, accounts, experian, transunion, equifax };
    }
    return {
      success: true,
      // Echoed back by the Edge Function unchanged, but included here too
      // so this return value is a complete drop-in for callers (like
      // SmartIdiQModal.jsx's commonUpdateAndUpload) that serialize the
      // whole result straight into thread.json.
      accounts: classified.accounts || accounts,
      experian: classified.experian || experian,
      transunion: classified.transunion || transunion,
      equifax: classified.equifax || equifax,
    };
  } catch (err) {
    console.warn("classify-inquiries call failed, keeping unclassified data:", err);
    return { success: false, accounts, experian, transunion, equifax };
  }
}
