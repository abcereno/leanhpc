-- sql/add_authorization_overrides.sql
--
-- HPC Ops Sprint — Priority 1 (Inquiry Authorization Protection).
--
-- Reframed against what already exists (see HPC-Sprint-Audit-Checklist.md):
-- this codebase already has everything needed to know "actual vs
-- authorized" per bureau — count_review_requests.ai_count (the disputable
-- count as of the last save) and clients.approved_{bureau}_count (what a
-- supervisor has actually approved to dispute/remove, sql/count_review.sql
-- + sql/phase0_persisted_counts.sql). No new "authorized_inquiries" column
-- or "authorization_holds" table is needed — a hold is simply: a PENDING
-- count_review_requests row whose ai_count exceeds the client's already-
-- established approved_{bureau}_count (see src/utils/authorizationHold.js).
--
-- The one thing that doesn't already exist anywhere is a permanent record
-- of a manager choosing to override that hold and let processing (marking
-- a bureau complete) proceed anyway. That's this table: append-only, no
-- update/delete policy at all, same pattern as count_review_approvals.
--
-- Depends on sql/count_review.sql and sql/phase0_persisted_counts.sql
-- already being run. Safe to run once; idempotent (IF NOT EXISTS guards,
-- DROP POLICY IF EXISTS before each CREATE POLICY).

create table if not exists public.authorization_overrides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  bureau text not null check (bureau in ('Experian', 'TransUnion', 'Equifax')),
  ai_count integer,
  approved_count integer,
  reason text not null,
  manager_id uuid references auth.users(id),
  manager_initials text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_authorization_overrides_client_id on public.authorization_overrides (client_id);

alter table public.authorization_overrides enable row level security;

drop policy if exists "staff can read authorization overrides" on public.authorization_overrides;
create policy "staff can read authorization overrides"
  on public.authorization_overrides for select
  using (public.is_admin_staff());

-- Only someone with the override_authorization_hold permission can write a
-- row here — this IS the enforcement mechanism, not just an audit trail:
-- the frontend only lets marking a bureau complete past a hold proceed
-- after this insert succeeds. Reuses public.has_permission() from
-- sql/count_review.sql rather than adding a second copy of that function.
drop policy if exists "authorizers can insert authorization overrides" on public.authorization_overrides;
create policy "authorizers can insert authorization overrides"
  on public.authorization_overrides for insert
  with check (public.has_permission('override_authorization_hold') and (manager_id = auth.uid() or manager_id is null));

-- Deliberately no update/delete policies — permanent, append-only, exactly
-- like count_review_approvals.

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — run after testing an override:
-- --------------------------------------------------------------------------
-- select * from public.authorization_overrides order by created_at desc limit 20;
