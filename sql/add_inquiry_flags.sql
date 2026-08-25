-- sql/add_inquiry_flags.sql
--
-- Classic Report improvement #4 — lets a client flag a "No Match" inquiry
-- (src/components/shared/public/ClassicReportPage.jsx) as one they don't
-- recognize, from the unauthenticated /classic-report/:token page. Per
-- explicit product decision: this does NOT write into thread.json directly
-- (that stays the admin-owned dispute-classification file — see
-- useInquiriesThread.js) — it queues a review row an admin sees on the
-- client profile (FlaggedInquiriesPanel.jsx) and acts on manually, same
-- "flag now, human decides" shape as sql/count_review.sql's request/approval
-- split.
--
-- The public page has no auth.uid() at all (same as the rest of the token
-- link flow — see sql/add_classic_report_token.sql), so the INSERT policy
-- below authenticates the request the only way it can: the submitted row
-- must name a client_id + source_token pair that matches
-- clients.classic_report_token — exactly the same check
-- ClassicReportPage.jsx's own initial client lookup already does client-side.
-- Classic Report tokens are permanent (no expiry) — see
-- useClassicReportLink.js — so there's no expires_at check here either.
--
-- Safe to run once; idempotent (IF NOT EXISTS guards, DROP POLICY IF EXISTS
-- before each CREATE POLICY).

create table if not exists public.inquiry_flags (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  creditor text not null,
  bureau text not null check (bureau in ('TU', 'EX', 'EQ')),
  inquiry_date text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  source_token text not null,
  created_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

create index if not exists idx_inquiry_flags_client_id on public.inquiry_flags (client_id);
create index if not exists idx_inquiry_flags_status on public.inquiry_flags (status);

alter table public.inquiry_flags enable row level security;

-- Anyone holding a valid classic_report_token for this exact client can
-- queue a flag for it — same trust boundary as reading the report itself.
drop policy if exists "valid classic report token can insert inquiry flags" on public.inquiry_flags;
create policy "valid classic report token can insert inquiry flags"
  on public.inquiry_flags for insert
  with check (
    exists (
      select 1 from public.clients c
      where c.id = inquiry_flags.client_id
        and c.classic_report_token = inquiry_flags.source_token
    )
  );

-- Admin/staff review queue — same role check as every other internal queue
-- (count_review_requests, etc).
drop policy if exists "staff can read inquiry flags" on public.inquiry_flags;
create policy "staff can read inquiry flags"
  on public.inquiry_flags for select
  using (public.is_admin_staff());

drop policy if exists "staff can update inquiry flags" on public.inquiry_flags;
create policy "staff can update inquiry flags"
  on public.inquiry_flags for update
  using (public.is_admin_staff())
  with check (public.is_admin_staff());

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — run after a client submits a flag from the
-- Classic Report page:
-- --------------------------------------------------------------------------
-- select * from public.inquiry_flags order by created_at desc limit 20;
