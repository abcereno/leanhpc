-- sql/add_cs_call_tasks.sql
--
-- Backs the CS Dashboard's global "Tasks" nav section
-- (src/components/admin/customer-service/CsDashboard2.jsx). Today that
-- section's checkboxes are purely client-side — tasksData is derived by
-- flat-mapping every cs_call_log.next_steps array into synthetic,
-- un-persisted row objects (id: "${callId}-${index}"), so nothing ever
-- saves and a page refresh wipes any checked-off progress.
--
-- Deliberately a SEPARATE table from cs_call_log.next_steps (text[])
-- rather than converting that column to jsonb — next_steps still exists
-- and still gets written on every call save (it's what the per-call
-- details drawer's own "Tasks" tab reads, a different, narrower view
-- scoped to one call). cs_call_tasks is the one place a task's done/not
-- state — which spans and outlives any single call record — actually
-- lives. The dashboard keeps writing both: next_steps for the call's own
-- history, cs_call_tasks as the source of truth for the cross-call Tasks
-- section's checkboxes.
--
-- Same staff-only gate as cs_call_log itself — internal tool, not
-- partner/client-portal-facing.
--
-- Safe to run once; idempotent via IF NOT EXISTS / DROP POLICY IF EXISTS.
-- Run AFTER sql/add_cs_call_log.sql and sql/add_cs_call_log_leads.sql.

create table if not exists public.cs_call_tasks (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.cs_call_log(id) on delete cascade,
  task text not null,
  is_done boolean not null default false,
  due_date date,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_cs_call_tasks_call_id on public.cs_call_tasks (call_id);
create index if not exists idx_cs_call_tasks_is_done on public.cs_call_tasks (is_done);
create index if not exists idx_cs_call_tasks_due_date on public.cs_call_tasks (due_date);

alter table public.cs_call_tasks enable row level security;

drop policy if exists "internal staff can read cs call tasks" on public.cs_call_tasks;
create policy "internal staff can read cs call tasks"
  on public.cs_call_tasks for select
  using (public.is_admin_staff());

drop policy if exists "internal staff can insert cs call tasks" on public.cs_call_tasks;
create policy "internal staff can insert cs call tasks"
  on public.cs_call_tasks for insert
  with check (public.is_admin_staff());

drop policy if exists "internal staff can update cs call tasks" on public.cs_call_tasks;
create policy "internal staff can update cs call tasks"
  on public.cs_call_tasks for update
  using (public.is_admin_staff());

drop policy if exists "internal staff can delete cs call tasks" on public.cs_call_tasks;
create policy "internal staff can delete cs call tasks"
  on public.cs_call_tasks for delete
  using (public.is_admin_staff());

-- Backfill: every existing cs_call_log row's next_steps array becomes real,
-- checkable cs_call_tasks rows, due on that call's own follow_up_date.
-- Guarded per-call (not exists ... where ct.call_id = cl.id) so this is
-- safe to run again later without duplicating tasks that already got
-- backfilled or that the app has since written directly.
insert into public.cs_call_tasks (call_id, task, due_date, created_at)
select cl.id, t.task, cl.follow_up_date, cl.created_at
from public.cs_call_log cl
cross join lateral unnest(cl.next_steps) as t(task)
where cl.next_steps is not null
  and array_length(cl.next_steps, 1) > 0
  and not exists (select 1 from public.cs_call_tasks ct where ct.call_id = cl.id);
