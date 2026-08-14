-- sql/backfill_missing_document_routing.sql
--
-- Backfills Document Routing round 1 for clients who are marked paid
-- (clients.is_paid = true) but have zero rows in document_routing —
-- the "some people were marked paid but not on docs routing" symptom.
--
-- Root cause: several "mark as paid" call sites did a bare
-- `.update({ is_paid: true })` on the clients table instead of going
-- through utils/markClientPaid.js, which is the only place that also
-- inserts the client's first document_routing round. This left every
-- client activated through those paths permanently invisible on the
-- Document Routing page (DocumentRouting.jsx only lists clients that
-- already have a row there). Fixed at the code level in:
--   - src/components/admin/AdminPaymentVerifications.jsx (handleApprove,
--     service_type === 'account_activation' — manual receipt approval)
--   - src/components/individual/IndividualLayout.jsx (Stripe checkout
--     redirect handler, type === 'custom_service')
-- Both now call markClientPaid() like every other paid-marking call site
-- (useClientActions.js, AdminNewLeads.jsx, MoveForwardModal.jsx) already
-- did. This script is the one-time catch-up for clients who were already
-- marked paid before that fix — same insert markClientPaid() itself does
-- when it finds a paid client with no existing document_routing rows.
--
-- Deliberately does NOT touch clients.exp_status/tu_status/eq_status —
-- unlike markClientPaid()'s normal "resetting bureau statuses" behavior
-- for a brand-new activation, these are existing paid clients who may
-- already have real progress recorded; this only adds the missing queue
-- entry, it doesn't reset anything on the client record itself.
--
-- Safe to run more than once — the `not exists` guard makes it a no-op
-- for any client that already has a document_routing row (including one
-- this script itself just created).

insert into public.document_routing (client_id, round_count, status, assigned_admin_id)
select c.id, 1, 'PENDING', c.admin_id
from public.clients c
where c.is_paid = true
  and not exists (
    select 1 from public.document_routing dr where dr.client_id = c.id
  );

-- --------------------------------------------------------------------------
-- OPTIONAL verification queries — run after this migration:
-- --------------------------------------------------------------------------
-- select count(*) from public.clients c
--   where c.is_paid = true
--     and not exists (select 1 from public.document_routing dr where dr.client_id = c.id); -- expect 0
--
-- select c.full_name, dr.round_count, dr.status, dr.created_at
-- from public.document_routing dr
-- join public.clients c on c.id = dr.client_id
-- where dr.round_count = 1
-- order by dr.created_at desc
-- limit 20; -- sanity-check the newly-created rows
