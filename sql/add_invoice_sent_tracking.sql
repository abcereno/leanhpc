-- sql/add_invoice_sent_tracking.sql
--
-- The rebuilt CS Dashboard's File Status Payment column needs 3 states
-- (Not sent / Pending / Verified), but the app's real billing model only
-- has a 2-state is_paid boolean — nothing tracks whether an invoice/
-- payment link was ever sent in the first place. This adds exactly that
-- one field, rather than inventing a parallel billing system:
--   - Not sent: invoice_sent_at is null, is_paid is false
--   - Pending:  invoice_sent_at is set, is_paid is still false
--   - Verified: is_paid is true (invoice_sent_at is irrelevant once paid)
--
-- CS reps set invoice_sent_at themselves (they're the ones sending it) —
-- is_paid stays exactly as it already works everywhere else in the app
-- (markClientPaid.js, Stripe redirect handling, etc.), untouched by this
-- migration.
--
-- Safe to run once; idempotent via IF NOT EXISTS.

alter table public.clients
  add column if not exists invoice_sent_at timestamptz;
