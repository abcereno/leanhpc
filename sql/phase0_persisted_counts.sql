-- sql/phase0_persisted_counts.sql
--
-- HPC Ops Sprint — Phase 0 ("Shared foundations", the prerequisite for
-- Priority 1 Authorization Protection and Priority 2 Count Quality
-- Control). See HPC-Ops-Sprint-Implementation-Plan.md.
--
-- Two independent changes bundled here because they're both foundational
-- and both trivial to run once:
--
-- 1. Persist bureau inquiry counts as real integer columns on `clients`,
--    instead of only existing inside the thread.json blob in Storage.
--    ai_exp_count/ai_tu_count/ai_eq_count are written automatically by the
--    app (src/utils/inquiryCounts.js) every time a report is (re)parsed —
--    see useInquiriesThread.js's saveUpdatedThread(), UploadReportForm.jsx's
--    handleSave(), and SmartIdiQModal.jsx's commonUpdateAndUpload().
--    approved_exp_count/approved_tu_count/approved_eq_count default to
--    match the AI value and are only ever changed by a supervisor approval
--    (Priority 2, not built yet) — nothing in Priority 1's authorization
--    check should read the ai_* columns directly once Priority 2 exists,
--    only the approved_* ones.
--
-- 2. Add 'supervisor' to is_admin_staff() / is_privileged() — the frontend
--    (AuthContext.jsx's normalizeRole(), RoleGuard's allowedRoles lists)
--    already recognizes 'supervisor', but these two SQL functions gate
--    real RLS policies (client_notes among them — see the comment left in
--    sql/client_notes.sql anticipating exactly this) and were never
--    updated, so a supervisor account can reach dashboard UI today but
--    gets silently blocked by anything behind these two functions.
--
-- Safe to run once; idempotent (safe to re-run) via IF NOT EXISTS guards
-- and CREATE OR REPLACE FUNCTION.

-- --------------------------------------------------------------------------
-- 1. Persisted bureau counts
-- --------------------------------------------------------------------------

alter table public.clients add column if not exists ai_exp_count integer;
alter table public.clients add column if not exists ai_tu_count integer;
alter table public.clients add column if not exists ai_eq_count integer;

alter table public.clients add column if not exists approved_exp_count integer;
alter table public.clients add column if not exists approved_tu_count integer;
alter table public.clients add column if not exists approved_eq_count integer;

-- --------------------------------------------------------------------------
-- 2. Recognize 'supervisor' in the two role-gate functions
-- --------------------------------------------------------------------------

create or replace function public.is_admin_staff()
 returns boolean
 language sql
 security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from profiles
    where id = auth.uid() and (
      role = 'admin' or
      role = 'owner' or
      role = 'subadmin' or
      role = 'supervisor' or
      role = 'callers' or
      role = 'counters'
    )
  );
$function$;

create or replace function public.is_privileged()
 returns boolean
 stable
 security definer
 set search_path to 'public'
as $function$
  select exists(
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role in ('owner','admin','subadmin','supervisor')
  );
$function$;
