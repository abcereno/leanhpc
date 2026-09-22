-- sql/add_next_payment_due.sql
--
-- Adds a manually-set "next payment due" date to clients, backing the new
-- Payment Due reminder (ClientHeader.jsx's Status dropdown, useClientActions.js
-- #setNextPaymentDue / useAdminClients.js#handleSetNextPaymentDue) and the
-- matching badge in AdminClientList.jsx and the Ops Pipeline
-- (components/admin/ops/ClientCardGrid.jsx).
--
-- There's no recurring/subscription billing engine in this app (is_paid is
-- a one-time flag per round) — this is deliberately just a plain date staff
-- set by hand (e.g. "this client's on a monthly plan, remind me the 5th of
-- next month"), not a computed/derived field, so it works the same for any
-- billing arrangement without needing a real subscription schema.
--
-- Read via utils/aging.js#getPaymentDueStatus, same {daysLeft, isOverdue}
-- shape as the existing getCaseManagementCountdown (30-day report re-import
-- reminder) right above it in that file, so both reminder types render with
-- the same badge logic wherever they're shown.
--
-- Safe to run once; idempotent (IF NOT EXISTS guard).

alter table public.clients add column if not exists next_payment_due_at date;

create index if not exists idx_clients_next_payment_due_at on public.clients (next_payment_due_at);
