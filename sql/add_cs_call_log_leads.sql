-- sql/add_cs_call_log_leads.sql
--
-- Lets a cs_call_log row (src/components/admin/customer-service/
-- CsDashboard2.jsx) be logged against either an existing paying client
-- (clients.id, the only option until now) OR a raw prospect captured by
-- the public funding-eligibility widget (company_leads.id — see
-- EmbeddableEligibilityChecker.jsx#submitLeadForm and
-- src/components/admin/CompanyLeadsList.jsx, which already reads that
-- table). Those are two separate tables with unrelated id spaces — a
-- lead has no client_id until someone actually converts them — so this
-- adds a second nullable FK column rather than trying to force one FK to
-- cover both.
--
-- Run AFTER sql/add_cs_call_log.sql. Safe to run once; idempotent.

alter table public.cs_call_log
  alter column client_id drop not null;

alter table public.cs_call_log
  add column if not exists lead_id uuid references public.company_leads(id) on delete cascade;

-- Exactly one of client_id/lead_id must be set — never both, never
-- neither. Named so re-running this file doesn't error on a duplicate
-- constraint.
alter table public.cs_call_log
  drop constraint if exists cs_call_log_client_xor_lead;
alter table public.cs_call_log
  add constraint cs_call_log_client_xor_lead
  check (
    (client_id is not null and lead_id is null)
    or (client_id is null and lead_id is not null)
  );

create index if not exists idx_cs_call_log_lead_id on public.cs_call_log (lead_id);
