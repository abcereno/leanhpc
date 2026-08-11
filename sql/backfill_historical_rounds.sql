-- sql/backfill_historical_rounds.sql
--
-- sql/add_dispute_round.sql backfilled EVERY pre-existing client to
-- dispute_round = 1 when round tracking first shipped (there was no round
-- concept before that migration). Going forward, utils/clientDuplicateRound.js's
-- resolveRoundForNewClient() correctly increments the round for a NEW
-- submission that reuses an existing email — but it only runs at submission
-- time, so it never retroactively fixed historical duplicate emails that
-- already existed before this feature launched. Those clients still show
-- "Round 1" everywhere (RoundSwitcher on the Client Profile page,
-- AdminClientList.jsx's round dropdown) even when they shouldn't.
--
-- This is a one-time backfill: for every group of clients sharing the same
-- email (case-insensitive), assign dispute_round = 1, 2, 3... in the order
-- they were created.
--
-- ⚠️ IMPORTANT CAVEAT — read before running the UPDATE below:
-- A shared email does not always mean "the same person, returning." Two
-- different real clients (e.g. spouses, family members, a shared household
-- or business inbox) can legitimately share one email address. This script
-- has no way to tell that apart from an actual returning client — it will
-- number BOTH cases as Round 1/Round 2/etc. of "the same" client. Run the
-- PREVIEW query first and eyeball the results; if any group looks like two
-- unrelated people rather than one returning client, handle that email
-- manually (e.g. update one row's email slightly, or leave both at Round 1)
-- before/instead of running the UPDATE for that group.
--
-- Safe to re-run: already-correct rows (anything created after the round
-- feature shipped, which resolveRoundForNewClient already numbered
-- correctly) get recomputed to the exact same values, since row_number()
-- ordered by created_at reproduces the same sequence either way.

-- --------------------------------------------------------------------------
-- PREVIEW — run this first. Shows every email with more than one client
-- row, the round each would be assigned, and whether that differs from
-- what's stored today (changed = true is exactly what the UPDATE below
-- would touch).
-- --------------------------------------------------------------------------
with ranked as (
  select
    id,
    full_name,
    email,
    created_at,
    dispute_round as current_round,
    row_number() over (partition by lower(trim(email)) order by created_at asc) as computed_round,
    count(*) over (partition by lower(trim(email))) as group_size
  from public.clients
  where email is not null and trim(email) <> ''
)
select id, full_name, email, created_at, current_round, computed_round,
       (current_round is distinct from computed_round) as changed
from ranked
where group_size > 1
order by lower(trim(email)), computed_round;

-- --------------------------------------------------------------------------
-- UPDATE — only run after reviewing the preview above.
-- --------------------------------------------------------------------------
-- with ranked as (
--   select
--     id,
--     row_number() over (partition by lower(trim(email)) order by created_at asc) as computed_round
--   from public.clients
--   where email is not null and trim(email) <> ''
-- )
-- update public.clients c
-- set dispute_round = ranked.computed_round
-- from ranked
-- where c.id = ranked.id
--   and c.dispute_round is distinct from ranked.computed_round;
