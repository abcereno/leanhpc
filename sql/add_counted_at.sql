-- Adds a dedicated timestamp for "when a human actually finished reviewing
-- and saving this client's inquiry classifications" — set only by
-- useInquiriesThread.js's saveUpdatedThread (the real thread editor), NOT
-- by UploadReportForm.jsx or SmartIdiQModal.jsx, which just auto-save the
-- AI's initial classification with no human review step at all.
--
-- Why this exists: ClientSubmissionListener.jsx's "Pipeline (24h)" queue
-- widget needs to show how long counting took (created_at -> counted).
-- Using clients.updated_at as a stand-in is unreliable — that column
-- changes on ANY update to the row (a later unrelated edit, a payment
-- status change, etc.), not just the save that completed counting.
-- counted_at is written once, the same "frozen after first real save"
-- way start_inquiries already works, so it stays an accurate marker of
-- the actual review event forever after.
alter table public.clients
  add column if not exists counted_at timestamptz;

-- One-time backfill for existing clients that already have a real
-- start_inquiries value: we don't have a true historical timestamp for
-- when their thread was actually saved, so updated_at is used as the best
-- available approximation for this backfill ONLY. Going forward, every
-- new save sets counted_at precisely at save time via the app itself.
update public.clients
set counted_at = updated_at
where counted_at is null
  and start_inquiries is not null
  and start_inquiries !~ '^\(TU 0, EXP 0, EQ 0\)$';
