-- Adds a dedicated timestamp for "when this client's credit report was last
-- refreshed via an Update (SmartCredit or IdentityIQ)" — set only by
-- utils/reportStorage.js#saveUpdateAudit, which both providers' "Update
-- Existing" flows (ClientHeader.jsx's handleUpdateComplete, for both
-- Fetch3bModal.jsx and ParseRreportModal.jsx in isUpdateMode) call through.
--
-- Why this exists: Case Management (credit repair — see utils/services.js)
-- clients don't have a bureau-completion date the way Inquiry Deletion
-- does, so ops needs a different signal for "when do we need to check in on
-- this client again." The Production Queue's 30-day countdown badge
-- (utils/aging.js#getCaseManagementCountdown) used to count down from
-- paid_at (how long they've been a paying client) — that's not the same
-- thing as "how long since we last verified their report." This column is
-- the real source of truth for that once a report has actually been
-- updated; paid_at remains the fallback for clients that haven't had an
-- Update yet (additive migration, same pattern as counted_at/dispute_round
-- — old behavior degrades gracefully rather than breaking).
alter table public.clients
  add column if not exists last_report_update_at timestamptz;
