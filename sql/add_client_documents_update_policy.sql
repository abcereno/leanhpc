-- sql/add_client_documents_update_policy.sql
--
-- Fixes a silent Row Level Security gap found 2026-08-04: AI document
-- validation results (validation_status/validation_notes/expires_at/
-- ai_confidence/validated_at/doc_type — sql/add_document_validation.sql)
-- computed correctly and displayed fine for the rest of that session, then
-- reverted to "Not checked" on the next reload, with no error ever shown.
--
-- Root cause: SELECT and INSERT on client_documents already work fine
-- (uploads and previews load correctly), but no UPDATE policy existed for
-- this table. Postgres/PostgREST does NOT treat an RLS-blocked UPDATE as
-- an error — it just silently matches 0 rows and returns success. The app
-- code (CoverLetterAssets.jsx / CoverLetterAssetsLTOS.jsx /
-- LetterEditorModal.jsx's runValidation/handleCheckAsset) has been fixed
-- to chain `.select("id")` after the update and detect a 0-row result as
-- a failure, which is what surfaced this "Check Ran, But Couldn't Save —
-- 0 rows updated" toast in the first place. This migration is the actual
-- fix: it's the missing UPDATE policy itself.
--
-- Grants UPDATE using the same "does the caller own this client" check
-- already established elsewhere in this codebase (see
-- sql/count_review_v2.sql for the canonical three-way version of this
-- exact pattern):
--   1. Internal staff (admin/owner/subadmin/etc.) — public.is_admin_staff()
--   2. Individual portal clients, on their OWN record — clients.auth_user_id = auth.uid()
--   3. Company/partner portal users, on their OWN company's clients —
--      company_user_profiles links auth.uid() to company_id
--
-- Safe to run more than once (drop-then-recreate).

alter table public.client_documents enable row level security;

drop policy if exists "staff and portal users can update their own client documents" on public.client_documents;
create policy "staff and portal users can update their own client documents"
  on public.client_documents for update
  using (
    public.is_admin_staff()
    or exists (
      select 1 from public.clients c
      where c.id = client_documents.client_id
        and (
          c.auth_user_id = auth.uid()
          or exists (
            select 1 from public.company_user_profiles cup
            where cup.id = auth.uid() and cup.company_id = c.company_id
          )
        )
    )
  )
  with check (
    public.is_admin_staff()
    or exists (
      select 1 from public.clients c
      where c.id = client_documents.client_id
        and (
          c.auth_user_id = auth.uid()
          or exists (
            select 1 from public.company_user_profiles cup
            where cup.id = auth.uid() and cup.company_id = c.company_id
          )
        )
    )
  );

-- --------------------------------------------------------------------------
-- NOTE — the public/anonymous intake form (AddClientForm.jsx, routed at
-- /company/:companyId/add-clients, no auth guard) runs under the anon key
-- with NO authenticated user, so auth.uid() is null there and this policy
-- will NOT let it save validation results on a document uploaded through
-- that specific form. If "Check Ran, But Couldn't Save" still shows up on
-- the public intake form specifically (not the admin or company-portal
-- flows) after running this migration, that's a separate, narrower gap —
-- flag it and it can get its own follow-up policy. Not addressed here
-- since it wasn't the reported symptom.
-- --------------------------------------------------------------------------

-- OPTIONAL verification — run after applying, then re-run a "Check Now"
-- in the app and confirm the toast no longer appears:
-- select policyname, cmd, roles from pg_policies where tablename = 'client_documents';
