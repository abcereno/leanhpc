-- sql/add_bureau_call_routing.sql
--
-- Splits call_routing from "one combined row covers all 3 bureaus" into
-- per-bureau rows. Needed because Experian now runs on its own independent
-- clock (callable the instant a client is paid) while TransUnion/Equifax
-- stay on the existing docs-round cycle (callable once the round's docs
-- have existed 7 days) — see sql/self_healing_workflow_queues.sql for the
-- rule itself.
--
-- Purely additive: both new columns are nullable, so every existing
-- call_routing row (and the existing process_docs_to_calls/
-- process_calls_to_docs RPCs, which this migration does not touch) keeps
-- working exactly as before with bureau/round_count left NULL — a NULL
-- bureau is treated everywhere in the app as "legacy combined row, covers
-- all three bureaus" so nothing double-queues.
--
-- Safe to run once; idempotent (IF NOT EXISTS guards throughout).

alter table public.call_routing
  add column if not exists bureau text check (bureau in ('exp', 'tu', 'eq'));

alter table public.call_routing
  add column if not exists round_count integer;

create index if not exists idx_call_routing_client_bureau_status
  on public.call_routing (client_id, bureau, status);

comment on column public.call_routing.bureau is
  'Which bureau this call task is for (exp/tu/eq). NULL = legacy row created before this migration, treated as covering all three bureaus.';
comment on column public.call_routing.round_count is
  'Attempt/round number for this bureau''s call track. Experian counts its own call attempts independently of document_routing.round_count; TU/EQ rows mirror the document_routing round they came from.';

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — run after this migration:
-- --------------------------------------------------------------------------
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'call_routing'
-- order by ordinal_position;
