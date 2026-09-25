// src/utils/peopleSearch.js
//
// Client-side wrapper for the search_people RPC (see
// sql/add_search_people_rpc.sql) — Phase 3's "smarter New Client dedup".
// Never throws: a missing RPC (Phase 1/this migration not run yet) or a
// non-staff caller (the function raises if !is_admin_staff()) both just
// resolve to an empty result, since this is purely an advisory search, not
// something any add-client form's submit path depends on.
import { supabase } from "../supabaseClient";

export async function searchPeople(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const { data, error } = await supabase.rpc("search_people", { p_query: q });
  if (error) {
    console.warn(
      "searchPeople failed (run sql/add_client_identity_orders.sql and sql/add_search_people_rpc.sql, and confirm you're signed in as staff):",
      error.message
    );
    return [];
  }
  return data || [];
}
