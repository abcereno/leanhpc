-- sql/self_healing_workflow_queues.sql
--
-- Self-healing Docs/Calls workflow (see Workflow-Engine-Proposal-Review.md
-- and utils/workflowStage.js). Two rules, both computed from data that
-- already exists — no staff action required for a client to become
-- correctly queued:
--
--   1. Experian is its own independent track: the instant a client is paid
--      (and EXP isn't already completed/N/A/queued), an EXP call task
--      auto-appears in Call Routing. It never waits on documents at all.
--
--   2. TransUnion/Equifax stay on the existing document_routing round
--      cycle: once 7 days have passed since that round's document_routing
--      row was created (regardless of whether staff ever clicked "Send to
--      Call Queue"), a TU and/or EQ call task auto-appears for whichever
--      of the two isn't already completed/N/A/queued.
--
-- Depends on sql/add_bureau_call_routing.sql having been run first.
--
-- Deliberately does NOT touch the existing process_docs_to_calls /
-- process_calls_to_docs RPCs (not in this repo — defined directly in the
-- database) or change what the manual "Send to Call Queue" button in
-- DocumentRouting.jsx does. That button still works exactly as before,
-- creating a legacy bureau=NULL row when staff wants to expedite ahead of
-- the 7-day window. This function only fills the gap for whatever isn't
-- already covered by ANY pending row (legacy or bureau-specific) — so it
-- can never create a duplicate/competing call task.
--
-- Safe to run once; idempotent (CREATE OR REPLACE).

create or replace function public.sync_client_workflow_queues(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client record;
  v_latest_doc record;
  v_has_pending_exp boolean;
  v_has_pending_tu boolean;
  v_has_pending_eq boolean;
  v_next_exp_round integer;
begin
  select * into v_client from public.clients where id = p_client_id;

  -- Nothing to do for an unpaid, already-completed, or missing client.
  if not found or v_client.is_paid is not true or v_client.date_completed is not null then
    return;
  end if;

  -- ---- Experian: independent, immediate track ----
  if not coalesce(v_client.exp_completed, false) and not coalesce(v_client.exp_na, false) then
    select exists (
      select 1 from public.call_routing
      where client_id = p_client_id and status = 'PENDING' and (bureau = 'exp' or bureau is null)
    ) into v_has_pending_exp;

    if not v_has_pending_exp then
      select coalesce(max(round_count), 0) + 1 into v_next_exp_round
      from public.call_routing
      where client_id = p_client_id and bureau = 'exp';

      insert into public.call_routing (client_id, bureau, round_count, scheduled_date, status, assigned_admin_id)
      values (p_client_id, 'exp', v_next_exp_round, current_date, 'PENDING', v_client.admin_id);
    end if;
  end if;

  -- ---- TU/EQ: 7 days after the latest docs round was created ----
  select * into v_latest_doc
  from public.document_routing
  where client_id = p_client_id
  order by round_count desc, created_at desc
  limit 1;

  if found and v_latest_doc.created_at <= (now() - interval '7 days') then
    if not coalesce(v_client.tu_completed, false) and not coalesce(v_client.tu_na, false) then
      select exists (
        select 1 from public.call_routing
        where client_id = p_client_id and status = 'PENDING'
          and (bureau = 'tu' or bureau is null)
          and (round_count is null or round_count = v_latest_doc.round_count)
      ) into v_has_pending_tu;

      if not v_has_pending_tu then
        insert into public.call_routing (client_id, bureau, round_count, scheduled_date, status, assigned_admin_id)
        values (p_client_id, 'tu', v_latest_doc.round_count, (v_latest_doc.created_at::date + 7), 'PENDING', v_latest_doc.assigned_admin_id);
      end if;
    end if;

    if not coalesce(v_client.eq_completed, false) and not coalesce(v_client.eq_na, false) then
      select exists (
        select 1 from public.call_routing
        where client_id = p_client_id and status = 'PENDING'
          and (bureau = 'eq' or bureau is null)
          and (round_count is null or round_count = v_latest_doc.round_count)
      ) into v_has_pending_eq;

      if not v_has_pending_eq then
        insert into public.call_routing (client_id, bureau, round_count, scheduled_date, status, assigned_admin_id)
        values (p_client_id, 'eq', v_latest_doc.round_count, (v_latest_doc.created_at::date + 7), 'PENDING', v_latest_doc.assigned_admin_id);
      end if;
    end if;
  end if;
end;
$$;

-- Fleet-wide pass — called on-demand from the frontend whenever an ops
-- screen (Production Queue, Document Routing, Call Routing) loads (see
-- utils/clientsData.js / DocumentRouting.jsx / CallRouting.jsx). Only scans
-- paid, not-yet-completed clients, so this stays cheap as the client list
-- grows.
create or replace function public.sync_all_workflow_queues()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in select id from public.clients where is_paid = true and date_completed is null loop
    perform public.sync_client_workflow_queues(r.id);
  end loop;
end;
$$;

-- Both functions run as security definer (so they can see across every
-- client's rows regardless of the caller's own RLS visibility). Granted to
-- any authenticated user rather than gated to admin/staff specifically —
-- this is meant to fire passively on every relevant page load (Production
-- Queue, Document Routing, Call Routing), and none of those screens are
-- reachable by non-staff roles anyway, so an extra permission check here
-- would only risk silently skipping the healing pass for some staff
-- without adding real protection. It only ever inserts routing rows
-- (never reads/writes anything sensitive), same trust level as the
-- existing process_docs_to_calls/process_calls_to_docs RPCs those screens
-- already call unrestricted.
revoke all on function public.sync_client_workflow_queues(uuid) from public;
revoke all on function public.sync_all_workflow_queues() from public;
grant execute on function public.sync_client_workflow_queues(uuid) to authenticated;
grant execute on function public.sync_all_workflow_queues() to authenticated;

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — run after testing:
-- --------------------------------------------------------------------------
-- select * from public.call_routing where status = 'PENDING' order by scheduled_date;
--
-- OPTIONAL: for true 24/7 self-healing (not just "whenever someone opens an
-- ops screen"), schedule this with pg_cron if it's enabled on your Supabase
-- project (Database > Extensions):
--
--   select cron.schedule('sync-workflow-queues', '0 * * * *', $$select public.sync_all_workflow_queues()$$);
