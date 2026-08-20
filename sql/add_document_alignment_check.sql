-- sql/add_document_alignment_check.sql
--
-- "Alignment Check" — AI cross-reference of identity documents, FTC
-- reports, and generated letters against the client record on file
-- (name/address/SSN/email/phone), on top of the existing per-document
-- validity check from sql/add_document_validation.sql (expired/invalid/
-- needs_review). That migration's validation_status/validation_notes/
-- expires_at/ai_confidence columns are reused as-is — this one only adds
-- storage for the NEW structured match results, since the shape of what
-- gets checked differs by document type (an identity doc checks
-- name/address/ssn; an FTC report checks report-number format, dates,
-- name/email/phone, header/footer presence) and forcing all of that into
-- individual narrow boolean columns would mean a schema change every time
-- a new document type gets its own checks. A single jsonb column keeps it
-- extensible: identity docs store {ssnMatch, nameMatch, addressMatch},
-- FTC reports store {reportNumber, reportNumberValid, nameMatch,
-- emailMatch, phoneMatch, hasHeaderFooter, dateFound}, letters store
-- {nameMatch, addressMatch} — same column, different keys, read by
-- whatever UI cares about that doc_type.
--
-- doc_type itself needs no schema change — it's a plain text column with
-- no check constraint (see add_document_validation.sql), so the new
-- 'ftc_report' value (set by LogChecklistItemModal.jsx's required-upload
-- path) and letters (already inserted by LetterEditorModal.jsx, doc_type
-- backfilled below) both just work.
--
-- Safe to run more than once.

alter table public.client_documents
  add column if not exists validation_details jsonb;

-- Backfill doc_type for existing in-house letters (LetterEditorModal.jsx
-- never set doc_type — only CoverLetterAssets.jsx's license/ssn/poa rows
-- and the new ftc_report rows do). Scoped to the exact file_name pattern
-- that flow writes, so nothing else gets touched.
update public.client_documents
set doc_type = 'letter'
where doc_type is null
  and file_name like '% Cover Letter (In-House)';

create index if not exists idx_client_documents_ftc_report
  on public.client_documents (client_id)
  where doc_type = 'ftc_report';

-- --------------------------------------------------------------------------
-- OPTIONAL verification queries:
-- --------------------------------------------------------------------------
-- select doc_type, count(*) from public.client_documents group by 1 order by 1;
-- select client_id, doc_type, validation_status, validation_details from public.client_documents where doc_type in ('ftc_report','letter') order by client_id;
