-- sql/add_client_report_snapshots.sql
--
-- Persistent index of every credit-report snapshot ever saved for a client
-- (see src/utils/reportStorage.js#recordReportSnapshot, called from
-- saveUpdateAudit and ParseRreportModal.jsx's IdentityIQ initial-import
-- path — every "Initial Import" and "Update Existing" action on
-- ClientHeader.jsx's Reports dropdown).
--
-- This is deliberately a POINTER table, not a copy of the score/count
-- data — the actual snapshot content already lives in Supabase Storage at
-- `{client_id}/{report_date}_summary_report.json` (written by the same
-- save flow), which stays the single source of truth. This table exists
-- to answer two questions Storage's own file listing can't:
--
--   1. "What's this client's TRUE report history" — keyed by `email`
--      (lowercased), not `client_id`. A new dispute round creates a
--      brand-new `clients` row with a new UUID (see
--      utils/clientDuplicateRound.js), which silently orphaned a client's
--      prior round's report snapshots from useProgressReportData.js's old
--      per-client_id Storage listing — a report generated under an
--      earlier round became invisible once a new round started, even
--      though the file was never deleted. Querying this table by email
--      instead finds every snapshot across every round.
--
--   2. "What date does this snapshot actually represent" — `report_date`
--      prefers the date embedded IN the raw credit report itself
--      (Sources.Source[0].InquiryDate — see extractReportDate()) over the
--      date staff happened to click "Update Report," so the Progress
--      Report's period reflects the bureau's own reporting date whenever
--      that's available. `date_source` records which one was actually
--      used, so a `wall_clock` fallback (raw report had no usable date
--      field) stays visibly distinguishable from a real `report_date`.
--
-- Email is NOT database-unique (see sql/add_dispute_round.sql — only a
-- case-insensitive index, uniqueness is social/warn-on-duplicate, not
-- enforced) and can be null on legacy pre-dispute-round clients — both are
-- expected and handled by the read side falling back to the old
-- per-client_id Storage listing when no snapshot rows exist for a client.
--
-- Safe to run once; idempotent (IF NOT EXISTS guards, DROP POLICY IF
-- EXISTS before each CREATE POLICY). Depends on public.is_admin_staff()
-- already existing (sql/count_review.sql).

create table if not exists public.client_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  email text,
  report_date date not null,
  date_source text not null default 'wall_clock' check (date_source in ('report_date', 'wall_clock')),
  storage_path text not null,
  provider text,
  created_at timestamptz not null default now(),
  -- One snapshot per (client_id, report_date) — re-saving the same report
  -- date (e.g. re-running "Update Report" twice in a row before the
  -- bureau's data changes) upserts in place rather than duplicating.
  unique (client_id, report_date)
);

create index if not exists idx_client_report_snapshots_email on public.client_report_snapshots (lower(email));
create index if not exists idx_client_report_snapshots_client_id on public.client_report_snapshots (client_id);

alter table public.client_report_snapshots enable row level security;

drop policy if exists "staff can read report snapshots" on public.client_report_snapshots;
create policy "staff can read report snapshots"
  on public.client_report_snapshots for select
  using (public.is_admin_staff());

drop policy if exists "staff can insert report snapshots" on public.client_report_snapshots;
create policy "staff can insert report snapshots"
  on public.client_report_snapshots for insert
  with check (public.is_admin_staff());

drop policy if exists "staff can update report snapshots" on public.client_report_snapshots;
create policy "staff can update report snapshots"
  on public.client_report_snapshots for update
  using (public.is_admin_staff())
  with check (public.is_admin_staff());

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — a client's full report history across
-- every dispute round they've ever had:
-- --------------------------------------------------------------------------
-- select s.report_date, s.date_source, s.provider, s.client_id, c.dispute_round
-- from public.client_report_snapshots s
-- join public.clients c on c.id = s.client_id
-- where lower(s.email) = lower('someone@example.com')
-- order by s.report_date asc;
