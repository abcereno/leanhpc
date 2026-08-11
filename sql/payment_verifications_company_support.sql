-- Extends payment_verifications (previously individual-client-only Zelle
-- receipt uploads, see UniversalPaymentModal.jsx / AdminPaymentVerifications.jsx)
-- to also support company/partner subscription receipts.
--
-- Run this in the Supabase SQL editor before using the new company receipt
-- upload feature.

alter table public.payment_verifications
  add column if not exists company_id uuid references public.companies(id);

-- client_id was implicitly required before (every existing row has one);
-- company-submitted receipts won't have a client_id, so it must be nullable.
alter table public.payment_verifications
  alter column client_id drop not null;

create index if not exists idx_payment_verifications_company_id
  on public.payment_verifications using btree (company_id);

-- Guardrail: every receipt belongs to exactly one of a client or a company,
-- never both and never neither.
alter table public.payment_verifications
  drop constraint if exists payment_verifications_exactly_one_owner;

alter table public.payment_verifications
  add constraint payment_verifications_exactly_one_owner
  check (num_nonnulls(client_id, company_id) = 1);
