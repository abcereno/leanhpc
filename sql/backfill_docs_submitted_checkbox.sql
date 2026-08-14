-- sql/backfill_docs_submitted_checkbox.sql
--
-- One-time backfill for the gap just fixed in LogDocumentModal.jsx:
-- logging a document submission from the client profile page
-- (ClientHeader.jsx) or the Reminders Sidebar (RemindersSidebar.jsx) —
-- neither of which passes an `onLogged` callback — created a real
-- document_logs row (which is what Docs Routing's "Last Docs Submitted"
-- badge reads) but never flipped document_routing's own exp_submitted/
-- tu_submitted/eq_submitted checkbox for the client's current round. That
-- gap is now closed going forward (LogDocumentModal.jsx syncs the
-- checkbox itself regardless of caller), but rows logged before that fix
-- are still stuck showing a submitted badge next to an unchecked box.
--
-- This backfills those: for each client's current PENDING
-- document_routing round, check off any bureau that has a document_logs
-- entry logged AFTER that round started (its created_at) — scoped to
-- "after this round began" specifically so a stale log from a PRIOR round
-- never gets misattributed to the current one and wrongly checked.
--
-- Only ever flips false -> true, never true -> false (a checkbox someone
-- already unchecked on purpose, or a bureau already marked
-- complete/N-A, is left alone). Safe to run more than once.

with current_rounds as (
  -- Same tie-break as sql/self_healing_workflow_queues.sql and
  -- LogDocumentModal.jsx's own sync query: the highest round_count, most
  -- recently created if that's still ambiguous.
  select distinct on (client_id) id, client_id, created_at
  from public.document_routing
  where status = 'PENDING'
  order by client_id, round_count desc, created_at desc
),
bureau_logs as (
  select dl.client_id, upper(b) as bureau, dl.submitted_at
  from public.document_logs dl, unnest(dl.bureau) as b
  where dl.submitted_at is not null
)
update public.document_routing dr
set
  exp_submitted = dr.exp_submitted or exists (
    select 1 from bureau_logs bl
    join current_rounds cr on cr.id = dr.id
    where bl.client_id = cr.client_id and bl.bureau = 'EXP' and bl.submitted_at >= cr.created_at
  ),
  tu_submitted = dr.tu_submitted or exists (
    select 1 from bureau_logs bl
    join current_rounds cr on cr.id = dr.id
    where bl.client_id = cr.client_id and bl.bureau = 'TU' and bl.submitted_at >= cr.created_at
  ),
  eq_submitted = dr.eq_submitted or exists (
    select 1 from bureau_logs bl
    join current_rounds cr on cr.id = dr.id
    where bl.client_id = cr.client_id and bl.bureau = 'EQ' and bl.submitted_at >= cr.created_at
  )
where dr.id in (select id from current_rounds);

-- --------------------------------------------------------------------------
-- OPTIONAL verification queries — run before AND after the update above to
-- see exactly what changed:
-- --------------------------------------------------------------------------
--
-- Preview affected rows before running the UPDATE (comment the UPDATE out
-- first if you want a dry run):
--
-- with current_rounds as (
--   select distinct on (client_id) id, client_id, created_at, round_count
--   from public.document_routing
--   where status = 'PENDING'
--   order by client_id, round_count desc, created_at desc
-- ),
-- bureau_logs as (
--   select dl.client_id, upper(b) as bureau, dl.submitted_at
--   from public.document_logs dl, unnest(dl.bureau) as b
--   where dl.submitted_at is not null
-- )
-- select c.full_name, cr.round_count, cr.created_at as round_started,
--        dr.exp_submitted, dr.tu_submitted, dr.eq_submitted,
--        bl.bureau, bl.submitted_at as doc_logged_at
-- from current_rounds cr
-- join public.document_routing dr on dr.id = cr.id
-- join public.clients c on c.id = cr.client_id
-- join bureau_logs bl on bl.client_id = cr.client_id and bl.submitted_at >= cr.created_at
-- where (bl.bureau = 'EXP' and not dr.exp_submitted)
--    or (bl.bureau = 'TU'  and not dr.tu_submitted)
--    or (bl.bureau = 'EQ'  and not dr.eq_submitted)
-- order by c.full_name;
