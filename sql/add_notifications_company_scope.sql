-- sql/add_notifications_company_scope.sql
--
-- Backs the CS Dashboard's notification bell
-- (src/components/admin/customer-service/CsDashboard2.jsx), which today is
-- a stub — clicking it always shows a static "No new notifications" toast,
-- never reading any real table.
--
-- The `notifications` table already exists live in the database (created
-- ad hoc, never tracked as a migration) and is already relied on by
-- several call sites across the app: AdminClientList.jsx (reads
-- type='admin_help_request'), CompanyPaymentModal.jsx,
-- UniversalPaymentModal.jsx, IndividualLayout.jsx, and
-- ProfileDashboard.jsx (all insert type='admin_help_request' or
-- 'payment_verification', with client_id/message/status columns).
--
-- Deliberately additive-only — no CREATE TABLE, no RLS changes. The live
-- table's actual RLS is unknown from this codebase (it was never
-- migrated), and several of the existing insert call sites above run from
-- the individual/company portals, not internal staff — touching RLS here
-- blind could silently break those. This migration only adds the one
-- column the CS bell needs (company_id, so it can scope to LTOS only
-- instead of surfacing every company's rows) and backfills it for
-- existing rows from their linked client. Safe to run multiple times.

alter table public.notifications
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

create index if not exists idx_notifications_company_id on public.notifications (company_id);
create index if not exists idx_notifications_status on public.notifications (status);
create index if not exists idx_notifications_created_at on public.notifications (created_at desc);

-- Backfill: existing rows only carry client_id today, so without this
-- they'd permanently fall outside any company-scoped view (like the CS
-- bell) even though their client's company is already knowable.
update public.notifications n
set company_id = c.company_id
from public.clients c
where n.client_id = c.id
  and n.company_id is null;

-- Auto-fill company_id on every future insert too — a DB trigger instead
-- of touching the half-dozen JS call sites that insert into this table
-- today (AdminClientList.jsx, CompanyPaymentModal.jsx,
-- UniversalPaymentModal.jsx, IndividualLayout.jsx, ProfileDashboard.jsx),
-- none of which currently set company_id. One trigger here keeps every
-- future insert scopable without having to find and update each of them,
-- and without new call sites silently forgetting to set it.
create or replace function public.set_notification_company_id()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is null and new.client_id is not null then
    select company_id into new.company_id from public.clients where id = new.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_notification_company_id on public.notifications;
create trigger trg_set_notification_company_id
  before insert on public.notifications
  for each row execute function public.set_notification_company_id();
