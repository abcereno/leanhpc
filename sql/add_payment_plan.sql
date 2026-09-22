-- sql/add_payment_plan.sql
--
-- Adds staff-set payment-plan fields to clients, backing the new "Billing &
-- Payment Plan" panel on the client profile (ClientHeader.jsx via
-- ClientBillingPanel.jsx, useClientActions.js#setPaymentPlan). Sits
-- alongside the existing next_payment_due_at (sql/add_next_payment_due.sql)
-- rather than replacing it — this migration only adds the "how much /
-- how many payments" side of the picture.
--
-- Same reasoning as add_next_payment_due.sql: there's no recurring/
-- subscription billing engine in this app, so these are deliberately plain
-- fields staff fill in by hand (e.g. "$1,200 total, 4 payments of $300/mo"),
-- not a computed/derived plan. What's actually BEEN paid so far is derived
-- instead, at read time, from the `incomes` table (rows with
-- source = 'Client Payment' for this client_id — see
-- utils/markClientPaid.js's insert and utils/clientPayments.js's summary
-- query) rather than a separate manually-tracked "payments made" counter,
-- so it can't drift out of sync with the real income ledger.
--
--   total_amount_due          — the agreed total price for this round/plan.
--   payment_plan_installments — how many payments are required to complete it
--                                (null/1 = paid in full, not on a plan).
--   payment_plan_amount       — the amount per installment/month.
--
-- Safe to run once; idempotent (IF NOT EXISTS guard).

alter table public.clients add column if not exists total_amount_due numeric;
alter table public.clients add column if not exists payment_plan_installments integer;
alter table public.clients add column if not exists payment_plan_amount numeric;
