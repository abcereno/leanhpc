-- sql/add_outcome_ratio.sql
--
-- Backs the new weighted `clients.progress` formula (see
-- src/utils/progressWeighting.js for the full write-up):
--   progress = 70% dispute outcome + 10% FTC filed + 10% CFPB filed +
--              10% bureau calls (partial credit, ~3.33% per bureau)
-- applied to all 4 services, replacing the old outcome-only 100%-weighted
-- `progress`.
--
-- `outcome_ratio` is the NEW column this adds: just the raw 0-1 outcome
-- number (what `progress` used to BE, in full, before this change) —
-- deleted/disputable for Inquiry Deletion/Case Management, resolved-bureaus
-- /3 for Fraud Alert Removal/Personal Identifiers. Storing it separately
-- means the two trigger points that only affect docs/calls credit
-- (DocumentRouting.jsx's FTC/CFPB checkboxes, LogCallModal.jsx after a
-- call) can recompute the blended `progress` from stored columns alone,
-- without re-fetching and re-classifying a client's whole inquiry thread.
--
-- Safe to re-run — every UPDATE below is a plain recompute to the same
-- value given the same underlying data.

-- ============================================================================
-- STEP 1 — add the column
-- ============================================================================
alter table public.clients add column if not exists outcome_ratio numeric;

-- ============================================================================
-- STEP 2 — PREVIEW: backfill outcome_ratio from current data
-- ============================================================================
-- Fraud Alert Removal / Personal Identifiers: resolved bureaus / 3 (same
-- formula sql/backfill_direct_bureau_progress.sql already applied to
-- `progress` directly — recomputed here independently in case that
-- migration was never run, so this doesn't inherit a stale progress value).
-- Everything else (Inquiry Deletion / Case Management, and any future
-- service worked through the classification engine): current `progress` —
-- that number already IS today's outcome ratio, since outcome was the only
-- input to `progress` before this change.
select
  id,
  full_name,
  coalesce(service_id, dispute_method) as service,
  progress as current_progress,
  case
    when service_id in ('fraud_alert_removal', 'personal_identifiers')
      or (service_id is null and lower(trim(dispute_method)) in ('fraud alert removal', 'personal identifiers'))
    then (
      (case when exp_completed or exp_na then 1 else 0 end) +
      (case when tu_completed  or tu_na  then 1 else 0 end) +
      (case when eq_completed  or eq_na  then 1 else 0 end)
    ) / 3.0
    else coalesce(progress, 0)
  end as computed_outcome_ratio
from public.clients
where outcome_ratio is null
order by full_name;

-- --------------------------------------------------------------------------
-- STEP 2 UPDATE — only run after reviewing the preview above.
-- --------------------------------------------------------------------------
-- update public.clients
-- set outcome_ratio = case
--   when service_id in ('fraud_alert_removal', 'personal_identifiers')
--     or (service_id is null and lower(trim(dispute_method)) in ('fraud alert removal', 'personal identifiers'))
--   then (
--     (case when exp_completed or exp_na then 1 else 0 end) +
--     (case when tu_completed  or tu_na  then 1 else 0 end) +
--     (case when eq_completed  or eq_na  then 1 else 0 end)
--   ) / 3.0
--   else coalesce(progress, 0)
-- end
-- where outcome_ratio is null;

-- ============================================================================
-- STEP 3 — PREVIEW: recompute `progress` under the new weighted formula,
-- using outcome_ratio (just backfilled above) + each client's latest
-- document_routing round's FTC/CFPB checkboxes + how many distinct bureaus
-- have ever been called (call_logs). Run STEP 2's UPDATE first — this reads
-- outcome_ratio, not the raw clients columns.
--
-- A fully-resolved outcome (outcome_ratio >= 1 — every bureau Deleted/N-A/
-- Linked-DND, or all 3 resolved for FAR/PI) always computes to 1 (100%),
-- full stop — the 70/10/10/10 split governs how progress climbs WHILE a
-- file is still open, it was never meant to cap an already-finished client
-- below 100% just because no call/doc row happens to exist for them.
-- Matches the same floor in src/utils/progressWeighting.js#blendProgress.
-- ============================================================================
with latest_routing as (
  select distinct on (client_id) client_id, ftc_completed, cfpb_completed
  from public.document_routing
  order by client_id, round_count desc
),
calls_credit as (
  select
    client_id,
    (case when bool_or(exp_result is not null) then 1 else 0 end) +
    (case when bool_or(tu_result  is not null) then 1 else 0 end) +
    (case when bool_or(eq_result  is not null) then 1 else 0 end) as bureaus_called
  from public.call_logs
  group by client_id
)
select
  c.id,
  c.full_name,
  c.progress as current_progress,
  case
    when coalesce(c.outcome_ratio, 0) >= 1 then 1
    else round((
      0.70 * coalesce(c.outcome_ratio, 0) +
      0.10 * (case when coalesce(lr.ftc_completed, false) then 1 else 0 end) +
      0.10 * (case when coalesce(lr.cfpb_completed, false) then 1 else 0 end) +
      0.10 * (coalesce(cc.bureaus_called, 0) / 3.0)
    )::numeric, 4)
  end as computed_progress
from public.clients c
left join latest_routing lr on lr.client_id = c.id
left join calls_credit cc on cc.client_id = c.id
order by c.full_name;

-- --------------------------------------------------------------------------
-- STEP 3 UPDATE — only run after reviewing the preview above.
-- --------------------------------------------------------------------------
-- with latest_routing as (
--   select distinct on (client_id) client_id, ftc_completed, cfpb_completed
--   from public.document_routing
--   order by client_id, round_count desc
-- ),
-- calls_credit as (
--   select
--     client_id,
--     (case when bool_or(exp_result is not null) then 1 else 0 end) +
--     (case when bool_or(tu_result  is not null) then 1 else 0 end) +
--     (case when bool_or(eq_result  is not null) then 1 else 0 end) as bureaus_called
--   from public.call_logs
--   group by client_id
-- )
-- update public.clients c
-- set progress = case
--   when coalesce(c2.outcome_ratio, 0) >= 1 then 1
--   else round((
--     0.70 * coalesce(c2.outcome_ratio, 0) +
--     0.10 * (case when coalesce(lr.ftc_completed, false) then 1 else 0 end) +
--     0.10 * (case when coalesce(lr.cfpb_completed, false) then 1 else 0 end) +
--     0.10 * (coalesce(cc.bureaus_called, 0) / 3.0)
--   )::numeric, 4)
-- end
-- from public.clients c2
-- left join latest_routing lr on lr.client_id = c2.id
-- left join calls_credit cc on cc.client_id = c2.id
-- where c.id = c2.id;
