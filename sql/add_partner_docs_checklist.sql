-- Persists the company portal's "Required Documents Checklist"
-- (RequiredDocsChecklist.jsx, rendered on ClientProfilePage.jsx) — that
-- checklist used to be local component state only (`reqChecks` in
-- ClientProfilePage.jsx), never read from or written to the database, so
-- every tick a partner made was silently lost on the next page load or
-- navigation. One jsonb column keyed by the same 4 item keys the component
-- already uses (idProvided/poaProvided/ssnProvided/monitoringActive) —
-- additive migration, same "old behavior degrades gracefully" pattern as
-- counted_at/dispute_round/last_report_update_at.
alter table public.clients
  add column if not exists partner_docs_checklist jsonb;
