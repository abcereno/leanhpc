-- sql/count_review.sql
--
-- HPC Ops Sprint — Priority 2 (AI Count Quality Control). See
-- HPC-Ops-Sprint-Implementation-Plan.md's "Priority 2" section for the full
-- spec this implements.
--
-- Depends on sql/phase0_persisted_counts.sql already being run (adds
-- clients.ai_*_count / approved_*_count, which this feature reads/writes).
--
-- Two tables:
--   count_review_requests  — the employee-facing request. Inserted by
--     useInquiriesThread.js's saveUpdatedThread() whenever an employee
--     WITHOUT the approve_count_reviews permission saves a change that
--     actually alters a bureau's AI count. One row per affected bureau.
--   count_review_approvals — separate, append-only decision table (never
--     touches the original request or clients.ai_*_count), so the original
--     AI count is never overwritten even once approved — see the plan doc's
--     reasoning under Priority 2.
--
-- Safe to run once; idempotent (IF NOT EXISTS guards, CREATE OR REPLACE
-- FUNCTION, DROP POLICY IF EXISTS before each CREATE POLICY).

-- --------------------------------------------------------------------------
-- 0. Helper: check the current user's profiles.permissions JSONB column.
--    Nothing in RLS has ever gated on the (app-level, checkbox-driven)
--    permission system before this — every prior policy used is_admin_staff()
--    / is_privileged(), which are role-based. This is the first permission
--    the app needs enforced at the DB level too (a non-approver could
--    otherwise call supabase.from("count_review_requests").update(...) from
--    the browser console and self-approve).
-- --------------------------------------------------------------------------

create or replace function public.has_permission(perm_key text)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select (permissions ->> perm_key)::boolean from public.profiles where id = auth.uid()),
    false
  );
$function$;

-- --------------------------------------------------------------------------
-- 1. count_review_requests
-- --------------------------------------------------------------------------

create table if not exists public.count_review_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  bureau text not null check (bureau in ('Experian', 'TransUnion', 'Equifax')),
  ai_count integer not null,
  employee_id uuid references auth.users(id),
  reason text not null check (reason in ('ocr_error', 'linked_inquiries', 'duplicate_inquiries', 'updated_report', 'other')),
  reason_detail text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now()
);

create index if not exists idx_count_review_requests_client_id on public.count_review_requests (client_id);
create index if not exists idx_count_review_requests_status on public.count_review_requests (status);

alter table public.count_review_requests enable row level security;

drop policy if exists "staff can read count review requests" on public.count_review_requests;
create policy "staff can read count review requests"
  on public.count_review_requests for select
  using (public.is_admin_staff());

drop policy if exists "staff can insert their own count review requests" on public.count_review_requests;
create policy "staff can insert their own count review requests"
  on public.count_review_requests for insert
  with check (public.is_admin_staff() and (employee_id = auth.uid() or employee_id is null));

-- Only approvers can change status (the approval queue sets it to
-- approved/denied) — this is the actual enforcement point stopping a
-- non-approver from self-approving their own request.
drop policy if exists "approvers can update count review requests" on public.count_review_requests;
create policy "approvers can update count review requests"
  on public.count_review_requests for update
  using (public.has_permission('approve_count_reviews'))
  with check (public.has_permission('approve_count_reviews'));

-- --------------------------------------------------------------------------
-- 2. count_review_approvals (append-only — no update/delete policy at all)
-- --------------------------------------------------------------------------

create table if not exists public.count_review_approvals (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null references public.count_review_requests(id) on delete cascade,
  supervisor_id uuid references auth.users(id),
  supervisor_initials text not null,
  approved_count integer not null,
  large_diff_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_count_review_approvals_request_id on public.count_review_approvals (review_request_id);

alter table public.count_review_approvals enable row level security;

drop policy if exists "staff can read count review approvals" on public.count_review_approvals;
create policy "staff can read count review approvals"
  on public.count_review_approvals for select
  using (public.is_admin_staff());

drop policy if exists "approvers can insert count review approvals" on public.count_review_approvals;
create policy "approvers can insert count review approvals"
  on public.count_review_approvals for insert
  with check (public.has_permission('approve_count_reviews') and (supervisor_id = auth.uid() or supervisor_id is null));

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — run after saving a test request/approval:
-- --------------------------------------------------------------------------
-- select r.*, a.approved_count, a.supervisor_initials, a.large_diff_confirmed
-- from public.count_review_requests r
-- left join public.count_review_approvals a on a.review_request_id = r.id
-- order by r.created_at desc;
