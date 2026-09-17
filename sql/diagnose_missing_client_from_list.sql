-- sql/diagnose_missing_client_from_list.sql
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor) while
-- logged in as the project owner. That connection is the Postgres
-- superuser/service role and bypasses Row Level Security entirely, so it
-- shows ground truth — unlike the app itself (or any anon/authenticated
-- REST query), which is always filtered through RLS first.
--
-- Why this exists: a client marked paid (is_paid = true, confirmed via a
-- direct data check) was not appearing on the admin Client List
-- (/clients) — neither on the live site nor after a code fix for a known
-- Supabase "Max Rows" API cap (Settings -> API), which two other
-- read-only checks against this same client seemed to rule out as the
-- cause (the client ranked well within the newest 1000 rows by
-- created_at, and the row itself has no other obviously-wrong field).
-- That leaves Row Level Security as the next real suspect: if `clients`
-- has a SELECT policy that scopes rows to the logged-in admin's own
-- admin_id (or company), a client assigned to a different admin would be
-- silently invisible to anyone else — no error, just zero rows, exactly
-- matching what's being seen. Section 4 below checks that directly.
--
-- Replace 'javidan alimusa' below with any other client's name to reuse
-- this for a future "marked paid but missing from the list" report.


-- 1. Find the client row(s) directly, no RLS, no frontend filtering.
--    Confirms the row exists, is actually paid, and shows the fields the
--    admin Client List's "Paid" tab filters on (is_paid, all_completed)
--    plus admin_id/company_id (who currently "owns" this client per RLS).
SELECT
  id, full_name, email, is_paid, paid_at, created_at,
  dispute_round, all_completed, exp_completed, tu_completed, eq_completed,
  exp_na, tu_na, eq_na, admin_id, company_id, agent
FROM clients
WHERE full_name ILIKE '%javidan%alimusa%'
ORDER BY created_at DESC;


-- 2. Total row count vs. the 1000-row API cap the admin list's old code
--    (and 3 other files with the same bug, now fixed in source) was
--    silently truncating at. If this is over 1000, the cap was real —
--    just not necessarily this client's problem specifically.
SELECT count(*) AS total_clients FROM clients;


-- 3. Where this client ranks in the exact "newest first" ordering the
--    admin list sorts by. rn <= 1000 means they'd have been included even
--    under the old buggy (capped) query — i.e. the cap is NOT what's
--    hiding them, and the real cause is elsewhere (see section 4).
--    rn > 1000 means the cap genuinely explains it, and the code fix
--    (already applied, pending deploy/rebuild) is the correct fix.
WITH ranked AS (
  SELECT id, full_name, created_at,
         row_number() OVER (ORDER BY created_at DESC) AS rn
  FROM clients
)
SELECT * FROM ranked WHERE full_name ILIKE '%javidan%alimusa%';


-- 4. Row Level Security policies currently active on `clients` for
--    SELECT. Look specifically for any USING clause that compares
--    admin_id (or company_id) to auth.uid() / a profiles lookup — that
--    would mean an admin without a matching admin_id can NEVER see this
--    client through the app, regardless of any "view_all_clients"
--    permission checkbox in the app's own UI, because Postgres filters
--    the rows out before the app's own logic ever runs.
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expression,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expression
FROM pg_policy
WHERE polrelid = 'public.clients'::regclass;


-- 5. Whether RLS is even enabled on this table at all (if it's off,
--    section 4's policies are irrelevant/inactive and this isn't the
--    cause either).
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.clients'::regclass;


-- 6. Who admin_id 060291e3-a0f2-4634-b212-81c0a5fc1f51 (this client's
--    assigned admin, from section 1) actually is, and whether that
--    matches whichever admin account is currently logged in and looking
--    for this client. A mismatch here is the smoking gun for section 4's
--    RLS theory.
SELECT id, full_name, email
FROM profiles
WHERE id = '060291e3-a0f2-4634-b212-81c0a5fc1f51';
