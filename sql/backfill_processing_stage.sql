-- sql/backfill_processing_stage.sql
--
-- Requires sql/add_processing_stage.sql to have been run first (adds
-- clients.processing_stage / processing_stage_updated_at).
--
-- One-time backfill: infer a starting processing_stage for existing paid,
-- not-yet-complete clients from data already on file, so staff aren't stuck
-- manually clicking through every existing client in the new Stage column/
-- kanban/dropdown (utils/processingStage.js's 4 entry points) before they
-- can start using it. Only touches clients where processing_stage IS NULL —
-- anything already set (manually, or by a prior run of this script) is left
-- alone. Every change going forward still has to be made by hand through one
-- of the 4 entry points; this just seeds a sane starting point.
--
-- Inference, highest-priority signal wins (mirrors the "latest document_routing
-- round" + "call_logs" sources src/utils/progressWeighting.js already reads
-- for the same clients):
--   1. Latest document_routing round_count >= 2 (a second/re-dispute round
--      already exists)                                -> re_dispute_in_progress
--   2. outcome_ratio > 0 (some bureaus already resolved/deleted/N-A — a real
--      outcome is on file, so bureaus must have responded)
--                                                       -> bureau_response_received
--   3. Latest round's ftc_completed/cfpb_completed, OR any call ever logged,
--      but no outcome yet (still working/waiting)      -> awaiting_bureaus
--   4. A document_routing round exists at all, none of the above yet
--                                                       -> letter_sent
--   5. No document_routing round on file                -> left NULL (Not
--      Started) — nothing to infer a stage from.
--
-- Deliberately NEVER auto-assigns "results_finalizing" — that stage means
-- "outcome confirmed, wrapping up before marking Complete," which isn't a
-- fact derivable from these columns; staff pick it by hand when they're
-- actually at that point.
--
-- Safe to re-run — only ever touches rows still at processing_stage IS NULL.

-- ============================================================================
-- PREVIEW — review before running the UPDATE below.
-- ============================================================================
with latest_routing as (
  select distinct on (client_id) client_id, round_count, ftc_completed, cfpb_completed
  from public.document_routing
  order by client_id, round_count desc
),
calls_credit as (
  select client_id, count(*) > 0 as any_call_logged
  from public.call_logs
  group by client_id
)
select
  c.id,
  c.full_name,
  c.progress,
  c.outcome_ratio,
  lr.round_count,
  lr.ftc_completed,
  lr.cfpb_completed,
  coalesce(cc.any_call_logged, false) as any_call_logged,
  case
    when lr.round_count is null then null
    when lr.round_count >= 2 then 're_dispute_in_progress'
    when coalesce(c.outcome_ratio, 0) > 0 then 'bureau_response_received'
    when coalesce(lr.ftc_completed, false) or coalesce(lr.cfpb_completed, false) or coalesce(cc.any_call_logged, false)
      then 'awaiting_bureaus'
    else 'letter_sent'
  end as inferred_stage
from public.clients c
left join latest_routing lr on lr.client_id = c.id
left join calls_credit cc on cc.client_id = c.id
where c.is_paid = true
  and c.processing_stage is null
  and coalesce(c.progress, 0) < 1
  and c.date_completed is null
order by c.full_name;

-- --------------------------------------------------------------------------
-- UPDATE — only run after reviewing the preview above.
-- --------------------------------------------------------------------------
-- with latest_routing as (
--   select distinct on (client_id) client_id, round_count, ftc_completed, cfpb_completed
--   from public.document_routing
--   order by client_id, round_count desc
-- ),
-- calls_credit as (
--   select client_id, count(*) > 0 as any_call_logged
--   from public.call_logs
--   group by client_id
-- ),
-- inferred as (
--   select
--     c.id,
--     case
--       when lr.round_count is null then null
--       when lr.round_count >= 2 then 're_dispute_in_progress'
--       when coalesce(c.outcome_ratio, 0) > 0 then 'bureau_response_received'
--       when coalesce(lr.ftc_completed, false) or coalesce(lr.cfpb_completed, false) or coalesce(cc.any_call_logged, false)
--         then 'awaiting_bureaus'
--       else 'letter_sent'
--     end as stage
--   from public.clients c
--   left join latest_routing lr on lr.client_id = c.id
--   left join calls_credit cc on cc.client_id = c.id
--   where c.is_paid = true
--     and c.processing_stage is null
--     and coalesce(c.progress, 0) < 1
--     and c.date_completed is null
-- )
-- update public.clients c
-- set processing_stage = inferred.stage,
--     processing_stage_updated_at = now()
-- from inferred
-- where c.id = inferred.id
--   and inferred.stage is not null;
