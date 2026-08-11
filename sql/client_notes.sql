-- sql/client_notes.sql
--
-- Adds "Manager Notes" support (Internal / Partner / Client notes, with
-- pinning) for the Bernard Ops Sprint, Priority 3.
--
-- The existing `comments` table (rendered as "Activity Thread" in
-- CommentsSection.jsx) and `clients.special_instructions_notes` (a single
-- append-only text blob) are both single-audience/single-type, so this is
-- a new table rather than overloading either of those — see
-- HPC-Ops-Sprint-Implementation-Plan.md for the reasoning.
--
-- Safe to run once; idempotent (safe to re-run) via IF NOT EXISTS guards
-- and DROP POLICY IF EXISTS before each CREATE POLICY.
--
-- Nothing in the app reads/writes this table until you run this file —
-- src/hooks/useClientNotes.js will fail soft (migrationMissing = true)
-- until it exists.

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  note_type text not null check (note_type in ('internal', 'partner', 'client')),
  is_pinned boolean not null default false,
  author_id uuid references auth.users(id),
  author_name text,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_notes_client_id on public.client_notes (client_id);
create index if not exists idx_client_notes_client_pinned on public.client_notes (client_id, is_pinned);

alter table public.client_notes enable row level security;

-- Internal staff (owner/admin/subadmin/caller/counter, per is_admin_staff())
-- can read and write every note type, including internal-only notes.
drop policy if exists "internal staff can read all client notes" on public.client_notes;
create policy "internal staff can read all client notes"
  on public.client_notes for select
  using (public.is_admin_staff());

drop policy if exists "internal staff can insert client notes" on public.client_notes;
create policy "internal staff can insert client notes"
  on public.client_notes for insert
  with check (public.is_admin_staff());

drop policy if exists "internal staff can update client notes" on public.client_notes;
create policy "internal staff can update client notes"
  on public.client_notes for update
  using (public.is_admin_staff());

-- NOTE: if you've added 'supervisor' as a profiles.role value (see
-- AuthContext.jsx), is_admin_staff() needs to include it too, or
-- supervisor accounts won't pass these policies:
--
--   create or replace function public.is_admin_staff()
--    returns boolean language sql security definer set search_path to 'public' as $$
--     select exists (
--       select 1 from profiles
--       where id = auth.uid() and role in
--         ('admin','owner','subadmin','supervisor','callers','counters')
--     );
--   $$;
--
-- (Note the existing function checks the *raw* profiles.role value, not
-- the app's normalizeRole() output — 'callers'/'counters' plural is not a
-- typo, it matches what's already there today.)

-- Company/affiliate portal users are NOT granted a policy here on purpose:
-- those portals should never see note_type = 'internal'. If/when the
-- partner-facing portals need to read their own clients' partner/client
-- notes, add a scoped SELECT policy here (note_type <> 'internal' AND the
-- client's company_id/affiliate_id matches the caller) rather than
-- widening the internal-staff policy above.
