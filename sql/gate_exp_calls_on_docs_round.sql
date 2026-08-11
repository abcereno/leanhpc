-- sql/gate_exp_calls_on_docs_round.sql
--
-- Experian moves onto the SAME workflow as TransUnion/Equifax: previously
-- (sql/self_healing_workflow_queues.sql, then
-- sql/require_docs_submitted_before_tueq_calls.sql) EXP was an independent
-- track that auto-queued a call the instant a client was paid, with no
-- docs wait at all. Per the client's explicit ask, EXP now goes through
-- the identical docs-round gate TU/EQ already use:
--   - a document_routing round must exist for this client
--   - 7 days have passed since that round was created
--   - ftc_completed = true
--   - cfpb_completed = true
--   - exp_submitted = true (the EXP checkbox in DocumentRouting.jsx —
--     already existed as a column, just never checked by this function)
--
-- EXP, TU, and EQ are still each gated independently on their OWN
-- submitted flag (exp_submitted / tu_submitted / eq_submitted) once the
-- shared ftc/cfpb/7-day conditions are met — one bureau can queue while
-- the others are still waiting on their own checkbox, same as TU/EQ
-- already worked relative to each other.
--
-- This redefines sync_client_workflow_queues(uuid) (CREATE OR REPLACE —
-- same function/signature as before, safe to run over either prior
-- version) so EXP no longer has its own separate independent-track block
-- or its own round counter (it used to increment call_routing's own
-- max(round_count) for bureau='exp', decoupled from document_routing
-- entirely) — it now shares document_routing's round_count exactly like
-- TU/EQ do.
--
-- See src/utils/workflowStage.js's matching frontend change (EXP now runs
-- through the same computeDocsGatedStage(...) helper TU/EQ uses, instead
-- of its own always-ready-immediately function).
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
  v_docs_ready boolean;
begin
  select * into v_client from public.clients where id = p_client_id;

  -- Nothing to do for an unpaid, already-completed, or missing client.
  if not found or v_client.is_paid is not true or v_client.date_completed is not null then
    return;
  end if;

  -- ---- EXP/TU/EQ all share the same docs-round gate now ----
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
    if not coalesce(v_client.exp_completed, false) and not coalesce(v_client.exp_na, false)
       and coalesce(v_latest_doc.exp_submitted, false) then
      select exists (
        select 1 from public.call_routing
        where client_id = p_client_id and status = 'PENDING'
          and (bureau = 'exp' or bureau is null)
          and (round_count is null or round_count = v_latest_doc.round_count)
      ) into v_has_pending_exp;

      if not v_has_pending_exp then
        insert into public.call_routing (client_id, bureau, round_count, scheduled_date, status, assigned_admin_id)
        values (p_client_id, 'exp', v_latest_doc.round_count, (v_latest_doc.created_at::date + 7), 'PENDING', v_latest_doc.assigned_admin_id);
      end if;
    end if;

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

-- Same grants as the prior versions of this function — CREATE OR REPLACE
-- doesn't reset these, but re-asserting is harmless and keeps this file
-- runnable on its own.
revoke all on function public.sync_client_workflow_queues(uuid) from public;
grant execute on function public.sync_client_workflow_queues(uuid) to authenticated;

-- --------------------------------------------------------------------------
-- OPTIONAL verification queries — run after this migration:
-- --------------------------------------------------------------------------
-- A paid client with EXP not yet done should now show a document_routing
-- round (not an immediately-queued EXP call) until that round is 7+ days
-- old with ftc_completed/cfpb_completed/exp_submitted all true:
--
-- select c.id, c.full_name, c.exp_completed, c.exp_na
-- from public.clients c
-- where c.is_paid = true and c.date_completed is null
--   and not coalesce(c.exp_completed, false) and not coalesce(c.exp_na, false)
--   and exists (
--     select 1 from public.call_routing cr
--     where cr.client_id = c.id and cr.status = 'PENDING' and cr.bureau = 'exp'
--   );
