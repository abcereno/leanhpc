-- sql/fix_orphaned_routing_rows.sql
--
-- Fixes "Unknown Client" rows in Document Routing / Call Routing.
--
-- Root cause: deleting a client (useAdminClients.js#handleDeleteClient,
-- useInquiriesThread.js, QuickImportDropdown.jsx — three separate code
-- paths, all doing a plain `clients.delete()`) never cleaned up that
-- client's document_routing/call_routing rows, because client_id on those
-- two tables was never enforced with an ON DELETE CASCADE foreign key
-- (unlike client_notes, which was — see sql/client_notes.sql's
-- `client_id uuid not null references public.clients(id) on delete
-- cascade`). The leftover rows then fail their `clients` join lookup, and
-- DocumentRouting.jsx's own fallback (`c || { full_name: "Unknown Client" }`,
-- see the "Process Existing Pending Doc Tasks" block) surfaces that as
-- "Unknown Client" / "Unknown" rows instead of just disappearing.
--
-- This is a two-part fix:
--   1. One-time cleanup of every orphaned row that already exists.
--   2. Add (or replace) the client_id foreign key on both tables with an
--      ON DELETE CASCADE one, so deleting a client from ANY code path (or
--      directly in the Supabase dashboard) automatically removes their
--      routing rows too — fixed once at the schema level instead of
--      needing all three (and any future) delete call sites to remember
--      to clean up after themselves.
--
-- Safe to run more than once (cleanup is a no-op the second time; the
-- constraint step drops-then-recreates its own constraint either way).

-- 1. Clean up existing orphans -----------------------------------------
delete from public.document_routing dr
where not exists (select 1 from public.clients c where c.id = dr.client_id);

delete from public.call_routing cr
where not exists (select 1 from public.clients c where c.id = cr.client_id);

-- 2. Make client_id a real ON DELETE CASCADE foreign key ----------------
-- Drops whatever FK constraint currently exists on either table's
-- client_id -> clients.id relationship (if any — it may not have had one
-- at all, which is how orphans could accumulate in the first place)
-- before adding the cascading replacement.
do $$
declare
  con record;
begin
  for con in
    select conname, conrelid::regclass::text as tbl
    from pg_constraint
    where contype = 'f'
      and conrelid in ('public.document_routing'::regclass, 'public.call_routing'::regclass)
      and confrelid = 'public.clients'::regclass
  loop
    execute format('alter table %s drop constraint %I', con.tbl, con.conname);
  end loop;
end $$;

alter table public.document_routing
  add constraint document_routing_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete cascade;

alter table public.call_routing
  add constraint call_routing_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete cascade;

-- --------------------------------------------------------------------------
-- OPTIONAL verification queries — run after this migration:
-- --------------------------------------------------------------------------
-- select count(*) from public.document_routing dr where not exists (select 1 from public.clients c where c.id = dr.client_id); -- expect 0
-- select count(*) from public.call_routing cr where not exists (select 1 from public.clients c where c.id = cr.client_id);       -- expect 0
-- select conname, confdeltype from pg_constraint where conrelid = 'public.document_routing'::regclass and contype = 'f'; -- confdeltype should be 'c'
-- select conname, confdeltype from pg_constraint where conrelid = 'public.call_routing'::regclass and contype = 'f';     -- confdeltype should be 'c'
