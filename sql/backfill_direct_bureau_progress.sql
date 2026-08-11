-- sql/backfill_direct_bureau_progress.sql
--
-- useClientActions.js#markBureauComplete/markBureauNA (the direct-flag
-- completion used by Fraud Alert Removal / Personal Identifiers — see
-- ClientHeader.jsx's isDirectBureauService) now also writes `progress`
-- as bureaus-resolved / 3, so partners' Client Management tabs
-- (ServiceClientList.jsx) show accurate percentages going forward. That
-- only fires on the NEXT bureau action though — any client on these two
-- services who was already fully or partially marked complete/N/A before
-- this change still has whatever stale `progress` value it had before
-- (commonly 0, even if fully done).
--
-- This is a one-time backfill: recompute `progress` for every existing
-- Fraud Alert Removal / Personal Identifiers client from their current
-- exp/tu/eq _completed/_na columns, using the exact same formula
-- (resolved bureau count / 3) the app now writes on every action. Purely
-- derived from columns already on the row — no thread.json/Storage read
-- needed, unlike sql/backfill_start_inquiries.sql — so a plain SQL
-- UPDATE is the correct tool here, not an admin UI button.
--
-- Matches both service_id (if sql/add_services.sql has been run) and the
-- raw dispute_method string case-insensitively (if it hasn't), same
-- fallback pattern as sql/add_services.sql's own backfill step.
--
-- Safe to re-run: recomputes to the same value every time for a given
-- bureau state.

-- --------------------------------------------------------------------------
-- PREVIEW — run this first. Shows every affected client, their current
-- progress, and what this backfill would set it to (changed = true is
-- exactly what the UPDATE below would touch).
-- --------------------------------------------------------------------------
select
  id,
  full_name,
  coalesce(service_id, dispute_method) as service,
  progress as current_progress,
  (
    (case when exp_completed or exp_na then 1 else 0 end) +
    (case when tu_completed  or tu_na  then 1 else 0 end) +
    (case when eq_completed  or eq_na  then 1 else 0 end)
  ) / 3.0 as computed_progress,
  progress is distinct from (
    (case when exp_completed or exp_na then 1 else 0 end) +
    (case when tu_completed  or tu_na  then 1 else 0 end) +
    (case when eq_completed  or eq_na  then 1 else 0 end)
  ) / 3.0 as changed
from public.clients
where service_id in ('fraud_alert_removal', 'personal_identifiers')
   or (
        service_id is null
        and lower(trim(dispute_method)) in ('fraud alert removal', 'personal identifiers')
      )
order by changed desc, full_name;

-- --------------------------------------------------------------------------
-- UPDATE — only run after reviewing the preview above.
-- --------------------------------------------------------------------------
-- update public.clients
-- set progress = (
--   (case when exp_completed or exp_na then 1 else 0 end) +
--   (case when tu_completed  or tu_na  then 1 else 0 end) +
--   (case when eq_completed  or eq_na  then 1 else 0 end)
-- ) / 3.0
-- where (
--   service_id in ('fraud_alert_removal', 'personal_identifiers')
--   or (
--        service_id is null
--        and lower(trim(dispute_method)) in ('fraud alert removal', 'personal identifiers')
--      )
-- )
-- and progress is distinct from (
--   (case when exp_completed or exp_na then 1 else 0 end) +
--   (case when tu_completed  or tu_na  then 1 else 0 end) +
--   (case when eq_completed  or eq_na  then 1 else 0 end)
-- ) / 3.0;
