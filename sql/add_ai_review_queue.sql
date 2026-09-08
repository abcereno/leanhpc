-- sql/add_ai_review_queue.sql
--
-- "AI needs help" escalation queue — a dedicated queue, separate from
-- count_review_requests (sql/count_review.sql), for inquiries the AI
-- classifier itself flagged as uncertain rather than ones a human disputed
-- the count on.
--
-- Signal used: supabase/functions/classify-inquiries/index.ts's own
-- applyDeterministicGuard() already downgrades a model-proposed "linked"/
-- "associated" call back to "non-linked" whenever it fails the date-window
-- or lender-identity check (including a requires_manual_review lender
-- match blocking a would-be "linked" call — see hasValidLinkedMatch/
-- guardReasonForLinked in that file), tagging the item `_classifierGuard`
-- with the specific reason. That tag already gets written into every
-- client's thread.json today (both live classification save paths —
-- UploadReportForm.jsx and SmartIdiQModal.jsx — serialize the classified
-- object as-is, no field whitelisting) but nothing has ever read it back
-- out. This table is where src/utils/aiReviewQueue.js#flagGuardedInquiries
-- writes one row per guarded inquiry, so it's a queryable list instead of
-- something only visible by opening a specific client's raw thread.json.
--
-- Deliberately NOT reusing count_review_requests — a supervisor's "double
-- check this count" and the AI's own "I wasn't confident here" are
-- different signals from different sources, and conflating them would make
-- CountReviewQueue.jsx's UI (which is entirely about approving a
-- dispute-count number) meaningless for a guard-reason row that has no
-- count to approve.
--
-- Safe to run once; idempotent (IF NOT EXISTS guards, DROP POLICY IF EXISTS
-- before each CREATE POLICY). Depends on public.has_permission() and
-- public.is_admin_staff() already existing (sql/count_review.sql).

create table if not exists public.ai_review_queue (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  bureau text not null check (bureau in ('Experian', 'TransUnion', 'Equifax')),
  creditor text,
  inquiry_date text,
  -- The classify-inquiries edge function's own guard reason string, e.g.
  -- 'downgraded_linked_unconfirmed_identity' — shown as-is in the UI
  -- rather than re-encoded into a second enum here.
  guard_reason text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- Same (client, bureau, creditor, date) guarded inquiry gets re-flagged
  -- on every re-classification (report re-upload, SmartCredit refresh,
  -- etc.) — this dedupes so a repeatedly-guarded item doesn't pile up
  -- duplicate rows, and (with the insert-only upsert in
  -- aiReviewQueue.js) means a row a staff member already resolved or
  -- dismissed stays that way instead of silently reopening.
  unique (client_id, bureau, creditor, inquiry_date)
);

create index if not exists idx_ai_review_queue_client_id on public.ai_review_queue (client_id);
create index if not exists idx_ai_review_queue_status on public.ai_review_queue (status);

alter table public.ai_review_queue enable row level security;

drop policy if exists "staff can read ai review queue" on public.ai_review_queue;
create policy "staff can read ai review queue"
  on public.ai_review_queue for select
  using (public.is_admin_staff());

-- Inserted by the classification save paths themselves (any staff member
-- running an import), not gated to a special permission — same reasoning
-- as count_review_requests' own insert policy.
drop policy if exists "staff can insert ai review queue rows" on public.ai_review_queue;
create policy "staff can insert ai review queue rows"
  on public.ai_review_queue for insert
  with check (public.is_admin_staff());

-- Only review_ai_flags holders can resolve/dismiss — mirrors
-- approve_count_reviews gating count_review_requests updates.
drop policy if exists "reviewers can update ai review queue" on public.ai_review_queue;
create policy "reviewers can update ai review queue"
  on public.ai_review_queue for update
  using (public.has_permission('review_ai_flags'))
  with check (public.has_permission('review_ai_flags'));

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — run after a report import flags something:
-- --------------------------------------------------------------------------
-- select q.*, c.full_name
-- from public.ai_review_queue q
-- join public.clients c on c.id = q.client_id
-- order by q.created_at desc;
