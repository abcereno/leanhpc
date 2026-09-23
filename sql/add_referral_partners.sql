-- sql/add_referral_partners.sql
--
-- Admin-managed list of LTOS's lead referral sources (e.g. "Direct",
-- plus whatever named partners staff add later), replacing free-typed
-- source text on new leads. Backs the rebuilt CS Dashboard's File Status
-- view (src/components/admin/customer-service/CsDashboard2.jsx) — see
-- that file's own header comment for the wider feature this supports.
--
-- Deliberately NOT reusing the existing `companies` table or the
-- view_partners/add_partners permissions — those already mean something
-- different (company-portal partners, see CompanyDirectory.jsx). A
-- referral source here is just a label on a lead, not a portal account.
--
-- Scoped to company_id (LTOS today) rather than global, so a future
-- second company using this dashboard gets its own independent list
-- instead of sharing LTOS's.
--
-- Only seeded with "Direct" (the generic "no referral partner" default)
-- — every other named source shown in earlier mockups was placeholder
-- data, not confirmed real partners, so nothing else is invented here.
-- Add real ones from the dashboard's own management UI.
--
-- Safe to run once; idempotent via IF NOT EXISTS / DROP POLICY IF EXISTS.

create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists idx_referral_partners_company_id on public.referral_partners (company_id);

alter table public.referral_partners enable row level security;

-- Same staff-only gate as cs_call_log/client_notes — internal tool, not
-- partner/client-portal-facing.
drop policy if exists "internal staff can read referral partners" on public.referral_partners;
create policy "internal staff can read referral partners"
  on public.referral_partners for select
  using (public.is_admin_staff());

drop policy if exists "internal staff can insert referral partners" on public.referral_partners;
create policy "internal staff can insert referral partners"
  on public.referral_partners for insert
  with check (public.is_admin_staff());

drop policy if exists "internal staff can update referral partners" on public.referral_partners;
create policy "internal staff can update referral partners"
  on public.referral_partners for update
  using (public.is_admin_staff());

drop policy if exists "internal staff can delete referral partners" on public.referral_partners;
create policy "internal staff can delete referral partners"
  on public.referral_partners for delete
  using (public.is_admin_staff());

-- Seed LTOS's default "Direct" source (id from src/utils/companies.js#LTOS_COMPANY_ID).
insert into public.referral_partners (company_id, name)
values ('e33ef166-d381-458e-a5c8-ac77557d5ea2', 'Direct')
on conflict (company_id, name) do nothing;

-- Links a company_leads row to the referral_partners list above.
-- Nullable (an existing/legacy lead with no source picked, or a lead
-- from the public funding-eligibility widget, shows as "Direct" in the
-- UI rather than blank) — see EmbeddableEligibilityChecker.jsx, which
-- inserts company_leads rows without ever setting this column.
alter table public.company_leads
  add column if not exists referral_partner_id uuid references public.referral_partners(id) on delete set null;

create index if not exists idx_company_leads_referral_partner_id on public.company_leads (referral_partner_id);

-- Same column on clients — the File Status view (readiness pipeline
-- toward "Ready for Roselle") operates on clients rows, not raw
-- company_leads (document/payment readiness can only be tracked once
-- someone is an actual client record — see CsDashboard2.jsx's own
-- comment on this). Carrying referral_partner_id here too means a
-- lead's source survives once they convert to a client, and lets a
-- client created directly (never a company_leads row at all — e.g. an
-- individual signup) still have a source recorded.
alter table public.clients
  add column if not exists referral_partner_id uuid references public.referral_partners(id) on delete set null;

create index if not exists idx_clients_referral_partner_id on public.clients (referral_partner_id);
