-- sql/add_services.sql
--
-- Normalizes `clients.dispute_method` (a free-text column, casing already
-- inconsistent in production: "inquiry deletion", "credit repair",
-- "Fraud Alert removal", "Personal Identifiers") into a proper reference
-- table + FK, so a client's service can be queried/joined uniformly instead
-- of relying on exact-string matches scattered across ~20 files.
--
-- Deliberately NOT a fully admin-manageable table (only 4 services exist and
-- rarely change) — this is a fixed, SQL-seeded reference list. The frontend
-- mirror lives in src/utils/services.js and must be kept in sync with the
-- rows below if a new service is ever added.
--
-- Deliberately NOT a hard cutover — `clients.dispute_method` is left in
-- place and still written by every existing call site. `service_id` is
-- populated going forward via utils/services.js#deriveServiceId(), called
-- from utils/clientDuplicateRound.js#insertClientRecord() (the shared
-- choke point for 6 of the add-client forms) plus the handful of call
-- sites that insert/update clients directly. Both columns are kept in
-- sync rather than replacing dispute_method outright, so nothing that
-- still reads dispute_method (e.g. InquiryRemovalClientList.jsx /
-- CreditRepairClientList.jsx's exact-match filters) breaks before those
-- read sites are migrated on their own schedule.
--
-- Safe to run once; idempotent.

-- --------------------------------------------------------------------------
-- 1. Reference table. Text primary key (not a generated uuid) so the
--    frontend can hardcode the same ids in utils/services.js without an
--    extra fetch-and-match round trip for what is effectively static data.
-- --------------------------------------------------------------------------

create table if not exists public.services (
  id text primary key,
  dispute_method text not null,   -- the exact legacy string this service maps to
  display_name text not null,
  sort_order integer not null default 0
);

insert into public.services (id, dispute_method, display_name, sort_order) values
  ('inquiry_deletion',     'inquiry deletion',      'Inquiry Deletion',      1),
  ('credit_repair',        'credit repair',         'Credit Repair',         2),
  ('fraud_alert_removal',  'Fraud Alert removal',   'Fraud Alert Removal',   3),
  ('personal_identifiers', 'Personal Identifiers',  'Personal Identifiers',  4)
on conflict (id) do nothing;

-- Reference data — every portal (admin/company/individual) needs to read
-- this for dropdown labels, so RLS is wide open on select. No
-- insert/update/delete policy: rows are only ever changed by re-running
-- this migration, never from the app.
alter table public.services enable row level security;

drop policy if exists "anyone can read services" on public.services;
create policy "anyone can read services"
  on public.services for select
  using (true);

-- --------------------------------------------------------------------------
-- 2. clients.service_id — nullable FK, added alongside dispute_method
--    (not replacing it — see file header).
-- --------------------------------------------------------------------------

alter table public.clients
  add column if not exists service_id text references public.services(id);

create index if not exists idx_clients_service_id on public.clients (service_id);

-- --------------------------------------------------------------------------
-- 3. Backfill existing clients from their current dispute_method, matching
--    case-insensitively since existing data's casing is inconsistent.
-- --------------------------------------------------------------------------

update public.clients c
set service_id = s.id
from public.services s
where c.service_id is null
  and c.dispute_method is not null
  and lower(trim(c.dispute_method)) = lower(trim(s.dispute_method));

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — any client with a dispute_method but no
-- matching service_id points at a dispute_method value not in the 4 known
-- services (a typo, or a 5th value that snuck in somewhere):
-- --------------------------------------------------------------------------
-- select id, full_name, dispute_method from public.clients
-- where dispute_method is not null and service_id is null;
