-- sql/add_cs_call_log.sql
--
-- Backs the new CS "Call Log" dashboard (src/components/admin/customer-
-- service/CsDashboard2.jsx) — a GHL-style outreach/check-in call log for
-- EXISTING PAYING CLIENTS (client_id is required), distinct from the
-- existing `call_logs` table, which is specifically bureau dispute calls
-- (EXP/TU/EQ, with DELETED/DISPUTED/etc. results — see CallLogs.jsx and
-- LogCallModal.jsx). This table's `outcome` values are a different,
-- CS-relationship taxonomy (Interested / Follow Up / Called / Not
-- Interested / Appointment Set), so it's a new table rather than
-- overloading `call_logs` with an unrelated status vocabulary (same
-- reasoning sql/client_notes.sql gives for not overloading `comments`).
--
-- Safe to run once; idempotent (safe to re-run) via IF NOT EXISTS guards
-- and DROP POLICY IF EXISTS before each CREATE POLICY.
--
-- Nothing in the app reads/writes this table until you run this file —
-- CsDashboard2.jsx fails soft (shows a "run this migration" notice)
-- until it exists.

create table if not exists public.cs_call_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  employee_id uuid references auth.users(id),
  called_by_name text,
  phone text,
  call_date date not null default (now()::date),
  call_time time,
  outcome text not null check (outcome in ('Interested', 'Follow Up', 'Called', 'Not Interested', 'Appointment Set')),
  follow_up_date date,
  source text,
  lead_status text,
  summary text,
  internal_notes text,
  next_steps text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_cs_call_log_client_id on public.cs_call_log (client_id);
create index if not exists idx_cs_call_log_follow_up_date on public.cs_call_log (follow_up_date);
create index if not exists idx_cs_call_log_call_date on public.cs_call_log (call_date desc);

alter table public.cs_call_log enable row level security;

-- Same staff-only gate as sql/client_notes.sql's is_admin_staff() — this is
-- an internal CS tool, not partner/client-portal-facing.
drop policy if exists "internal staff can read cs call log" on public.cs_call_log;
create policy "internal staff can read cs call log"
  on public.cs_call_log for select
  using (public.is_admin_staff());

drop policy if exists "internal staff can insert cs call log" on public.cs_call_log;
create policy "internal staff can insert cs call log"
  on public.cs_call_log for insert
  with check (public.is_admin_staff());

drop policy if exists "internal staff can update cs call log" on public.cs_call_log;
create policy "internal staff can update cs call log"
  on public.cs_call_log for update
  using (public.is_admin_staff());

drop policy if exists "internal staff can delete cs call log" on public.cs_call_log;
create policy "internal staff can delete cs call log"
  on public.cs_call_log for delete
  using (public.is_admin_staff());
