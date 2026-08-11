-- sql/add_postalocity_columns.sql
--
-- Adds two more prep-step checkboxes to document_routing, alongside the
-- existing ftc_completed/cfpb_completed: "Postalocity" (queued for mailing
-- via Postalocity) and "Certified Postalocity" (sent certified via
-- Postalocity). See src/utils/permissions.js's pre-existing
-- generate_postalocity_package / queue_postalocity permission keys — this
-- is the first actual feature wired up against those.
--
-- Purely additive: both columns are boolean, default false, so every
-- existing document_routing row (and every existing query that does
-- `select('*')` against this table, e.g. DocumentRouting.jsx) keeps
-- working unchanged and just picks up the two new fields as false.
--
-- Safe to run once; idempotent (IF NOT EXISTS guards throughout).

alter table public.document_routing
  add column if not exists postalocity_completed boolean not null default false;

alter table public.document_routing
  add column if not exists certified_postalocity_completed boolean not null default false;

comment on column public.document_routing.postalocity_completed is
  'Docs queued/sent for mailing via Postalocity for this round. Checking this in Document Routing opens a log-and-comment prompt (see LogChecklistItemModal.jsx), same pattern as ftc_completed/cfpb_completed.';
comment on column public.document_routing.certified_postalocity_completed is
  'Docs sent CERTIFIED via Postalocity for this round. Same logging pattern as postalocity_completed.';

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — run after this migration:
-- --------------------------------------------------------------------------
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'document_routing'
-- order by ordinal_position;
