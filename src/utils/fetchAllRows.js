// src/utils/fetchAllRows.js
//
// Fetches every row from a table by paging in batches, rather than trusting
// a single .range(0, 99999) call to out-run Supabase's row cap. A bare
// .range() request is what every other "fetch everything" call site in
// this codebase already uses (useAdminClients.js, DocumentRouting.jsx,
// clientsData.js) — but if the Supabase project has its own API "Max Rows"
// setting (Settings -> API), that setting silently overrides any .range()
// a client asks for and caps every single request at that number no matter
// what range was requested. DocumentRouting.jsx's comments already called
// this out as a known possibility.
//
// This helper works around that by requesting PAGE_SIZE rows at a time and
// looping until a page comes back short of PAGE_SIZE, so it self-adjusts
// to whatever the real per-request cap turns out to be instead of betting
// everything on one big range.
import { supabase } from "../supabaseClient";

const PAGE_SIZE = 1000;
const MAX_ROWS_SAFETY = 200000; // guards against an infinite loop, not a real limit

export async function fetchAllRows(tableName, { select = "*", order, ascending = true, filter } = {}) {
  let all = [];
  let from = 0;

  while (from < MAX_ROWS_SAFETY) {
    let q = supabase.from(tableName).select(select);
    if (filter) q = filter(q);
    if (order) q = q.order(order, { ascending });
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, error } = await q;
    if (error) return { data: null, error };

    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break; // short page = no more rows
    from += PAGE_SIZE;
  }

  return { data: all, error: null };
}
