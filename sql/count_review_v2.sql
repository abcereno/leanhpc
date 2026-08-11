-- sql/count_review_v2.sql
--
-- HPC Ops Sprint — Priority 2 follow-up. The original sql/count_review.sql
-- assumed an employee would manually open a "Request Count Review" modal and
-- pick a reason whenever the AI's original OCR count changed. In practice,
-- what the business actually wants is simpler: whenever classifications are
-- saved and the client has any Non-Linked / Associated / Dispute items, a
-- supervisor should confirm how many of those are actually approved to be
-- disputed/removed — every save, automatically, no manual reason-picker.
-- No AI/OCR count is involved at all (see utils/inquiryCounts.js's
-- computeDisputePendingCounts and utils/countReviewSync.js).
--
-- There are three places a save like this can happen, and all three need to
-- be able to insert/refresh a request here:
--   1. Admin panel — useInquiriesThread.js's saveUpdatedThread()
--   2. Individual portal client — same hook (ProfileDashboard.jsx renders
--      the same <InquiriesThread>), scoped to clients.auth_user_id = auth.uid()
--   3. Partner company portal user — InquirySelectionModal.jsx, scoped to
--      company_user_profiles linking auth.uid() to the client's company_id
--
-- Depends on sql/count_review.sql already being run.
-- Safe to run once; idempotent (drop-then-recreate constraint/policy).

-- --------------------------------------------------------------------------
-- 1. Allow the new automatic reason value alongside the original
--    employee-picked ones (that manual flow is removed from the UI, but old
--    rows/history keep their original reason values, so we're additive here,
--    not replacing).
-- --------------------------------------------------------------------------

alter table public.count_review_requests drop constraint if exists count_review_requests_reason_check;
alter table public.count_review_requests add constraint count_review_requests_reason_check
  check (reason in (
    'ocr_error', 'linked_inquiries', 'duplicate_inquiries', 'updated_report', 'other',
    'classification_save'
  ));

-- --------------------------------------------------------------------------
-- 2. Let an employee refresh the ai_count on their OWN still-pending
--    request (so a second/third save for the same client+bureau updates the
--    existing row instead of piling up duplicate pending rows) — but only
--    while it stays 'pending'. They can never use this to touch status,
--    since both the "using" (old row) and "with check" (new row) clauses
--    require status = 'pending' on both sides.
-- --------------------------------------------------------------------------

drop policy if exists "employees can refresh their own pending count review requests" on public.count_review_requests;
create policy "employees can refresh their own pending count review requests"
  on public.count_review_requests for update
  using (public.is_admin_staff() and employee_id = auth.uid() and status = 'pending')
  with check (public.is_admin_staff() and employee_id = auth.uid() and status = 'pending');

-- --------------------------------------------------------------------------
-- 3. Individual clients and company portal users can also queue/refresh a
--    count review — but ONLY for their OWN client, never anyone else's.
--    "Own" is checked the same way the rest of the app already scopes
--    these two portal types:
--      - individual: clients.auth_user_id = auth.uid()
--      - company:    company_user_profiles links auth.uid() to a
--                     company_id, which must match the client's company_id
--    Multiple permissive policies for the same command combine with OR, so
--    this is additive alongside the staff-only policies above — it doesn't
--    replace them.
-- --------------------------------------------------------------------------

drop policy if exists "portal users can insert count review requests for their own client" on public.count_review_requests;
create policy "portal users can insert count review requests for their own client"
  on public.count_review_requests for insert
  with check (
    exists (
      select 1 from public.clients c
      where c.id = count_review_requests.client_id
        and (
          c.auth_user_id = auth.uid()
          or exists (
            select 1 from public.company_user_profiles cup
            where cup.id = auth.uid() and cup.company_id = c.company_id
          )
        )
    )
  );

drop policy if exists "portal users can refresh their own pending count review requests" on public.count_review_requests;
create policy "portal users can refresh their own pending count review requests"
  on public.count_review_requests for update
  using (
    status = 'pending'
    and exists (
      select 1 from public.clients c
      where c.id = count_review_requests.client_id
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
    status = 'pending'
    and exists (
      select 1 from public.clients c
      where c.id = count_review_requests.client_id
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
-- OPTIONAL verification query — run after saving classifications as a
-- non-approver on a client with Non-Linked/Associated/Dispute items:
-- --------------------------------------------------------------------------
-- select * from public.count_review_requests order by created_at desc limit 20;
