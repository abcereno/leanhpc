-- sql/require_docs_submitted_before_tueq_calls.sql
--
-- Closes a gap in sql/self_healing_workflow_queues.sql: the TU/EQ half of
-- sync_client_workflow_queues() only ever checked whether 7 days had
-- passed since the latest document_routing round was CREATED — it never
-- checked whether that round's docs were actually submitted (the
-- ftc_completed / cfpb_completed / tu_submitted / eq_submitted checkboxes
-- in DocumentRouting.jsx). So a round that sat untouched for a week with
-- nothing ever checked off would still auto-queue a call — a useless call,
-- since nothing was actually sent to the bureau.
--
-- This redefines sync_client_workflow_queues(uuid) (CREATE OR REPLACE —
-- same function, same signature, safe to run over the version already
-- installed by self_healing_workflow_queues.sql) so a TU or EQ call now
-- only auto-queues once ALL of the following are true for the latest
-- document_routing round:
--   - 7 days have passed since it was created (unchanged)
--   - ftc_completed = true
--   - cfpb_completed = true
--   - that specific bureau's submitted flag is true
--     (tu_submitted for TU, eq_submitted for EQ)
--
-- TU and EQ are checked independently on their own submitted flag, so one
-- bureau can queue while the other is still waiting on its own checkbox —
-- matches how DocumentRouting.jsx already lets each bureau's checkbox be
-- checked independently.
--
-- Experian's block (the independent, no-docs-wait track) is untouched.
--
-- Safe to run any number of times.

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
  v_docs_ready boolean;
begin
  select * into v_client from public.clients where id = p_client_id;

  -- Nothing to do for an unpaid, already-completed, or missing client.
  if not found or v_client.is_paid is not true or v_client.date_completed is not null then
    return;
  end if;

  -- ---- Experian: independent, immediate track (unchanged) ----
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

  -- ---- TU/EQ: 7 days after the latest docs round was created, AND that
  -- round's docs actually submitted (see header) ----
  select * into v_latest_doc
  from public.document_routing
  where client_id = p_client_id
  order by round_count desc, created_at desc
  limit 1;

  v_docs_ready := found
    and v_latest_doc.created_at <= (now() - interval '7 days')
    and coalesce(v_latest_doc.ftc_completed, false)
    and coalesce(v_latest_doc.cfpb_completed, false);

  if v_docs_ready then
    if not coalesce(v_client.tu_completed, false) and not coalesce(v_client.tu_na, false)
       and coalesce(v_latest_doc.tu_submitted, false) then
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

    if not coalesce(v_client.eq_completed, false) and not coalesce(v_client.eq_na, false)
       and coalesce(v_latest_doc.eq_submitted, false) then
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

-- Same grants as self_healing_workflow_queues.sql — CREATE OR REPLACE
-- doesn't reset these, but re-asserting is harmless and keeps this file
-- runnable on its own.
revoke all on function public.sync_client_workflow_queues(uuid) from public;
grant execute on function public.sync_client_workflow_queues(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- OPTIONAL verification — a round that's 7+ days old but not fully
-- submitted should NOT have a pending TU/EQ call yet:
-- --------------------------------------------------------------------------
-- select dr.client_id, dr.round_count, dr.created_at, dr.ftc_completed, dr.cfpb_completed,
--        dr.tu_submitted, dr.eq_submitted
-- from public.document_routing dr
-- where dr.created_at <= now() - interval '7 days'
--   and not (coalesce(dr.ftc_completed,false) and coalesce(dr.cfpb_completed,false));
