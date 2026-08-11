-- sql/add_document_validation.sql
--
-- AI validity check for identity documents (Driver's License, SSN Card,
-- Proof of Address) uploaded via CoverLetterAssets.jsx into the existing
-- public.client_documents table.
--
-- IMPORTANT — client_documents is shared by two unrelated flows that use
-- `file_name` differently:
--   - CoverLetterAssets.jsx (identity docs): file_name is a fixed type key,
--     one of 'license' | 'ssn' | 'poa' — this is what this migration
--     targets.
--   - DocumentsSection.jsx (general document bin): file_name is the real
--     uploaded filename (e.g. "invoice.pdf") — unrelated paperwork, not
--     subject to validity checks. The backfill below is scoped with
--     `where file_name in ('license','ssn','poa')` specifically so it
--     never touches these rows.
--
-- doc_type is added as its own column (rather than continuing to overload
-- file_name) so this distinction is explicit and queryable going forward,
-- without changing file_name's existing meaning in either flow.
--
-- All new columns are nullable/defaulted — general-document rows from
-- DocumentsSection.jsx simply never get a doc_type or validation status,
-- which is correct (they were never identity documents to begin with).
--
-- Safe to run more than once. Earlier version of this file added the
-- check constraint with plain `add constraint` (no guard) — re-running it
-- as-is threw "constraint already exists", and because Supabase's SQL
-- editor runs a whole pasted script as one transaction, that single
-- failure could roll back EVERY statement above it in the same run,
-- silently undoing the column adds too. `drop constraint if exists`
-- immediately before re-adding it makes this safe to run any number of
-- times.

alter table public.client_documents
  add column if not exists doc_type text,
  add column if not exists validation_status text not null default 'pending',
  add column if not exists validation_notes text,
  add column if not exists expires_at date,
  add column if not exists validated_at timestamptz,
  add column if not exists ai_confidence numeric;

alter table public.client_documents
  drop constraint if exists client_documents_validation_status_check;

alter table public.client_documents
  add constraint client_documents_validation_status_check
  check (validation_status in ('pending', 'valid', 'expired', 'invalid', 'needs_review'))
  not valid;

-- Validate separately from adding it, so an unexpected legacy value never
-- blocks the additive column changes above from applying.
alter table public.client_documents
  validate constraint client_documents_validation_status_check;

create index if not exists idx_client_documents_doc_type
  on public.client_documents (client_id, doc_type);

-- Backfill doc_type for existing identity-doc rows only (see header note).
update public.client_documents
set doc_type = file_name
where file_name in ('license', 'ssn', 'poa')
  and doc_type is null;

-- --------------------------------------------------------------------------
-- OPTIONAL verification queries:
-- --------------------------------------------------------------------------
-- select doc_type, validation_status, count(*) from public.client_documents group by 1, 2 order by 1, 2;
-- select * from public.client_documents where doc_type is not null and validation_status = 'pending';
