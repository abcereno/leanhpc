-- sql/add_client_timeline_gap_notes.sql
--
-- Lets staff attach a reason to a gap on the Operational Timeline
-- (ClientSummaryModal.jsx) -- e.g. why 5 days passed between Payment
-- Received and Documents Received: "Docs not received", "Partner delay",
-- etc.
--
-- Reuses the existing client_notes table (sql/client_notes.sql) and its
-- useClientNotes.js hook rather than introducing a parallel notes table --
-- a gap reason is just an internal note tagged with which timeline
-- transition it explains (see src/utils/timelineGapNotes.js). Run
-- sql/client_notes.sql FIRST if it hasn't been run yet; this migration
-- only adds one nullable column to it.
--
-- gap_key is a stable slug built from the two step labels (e.g.
-- "payment__documents", see gapKeyFor() in timelineGapNotes.js) so a note
-- stays attached to the same logical transition even if the underlying
-- dates shift slightly on a resync. NULL for ordinary Manager Notes --
-- ManagerNotesPanel.jsx's query is unaffected by this migration since it
-- doesn't filter on this column (it just shows a "Timeline Gap" badge on
-- rows that have one, see gapKeyLabel()).
--
-- Multiple gap notes can exist for the same gap_key over time -- the UI
-- treats the most recent one as "the" current reason, same as any other
-- note thread, which doubles as a lightweight history of *why* the reason
-- was updated rather than silently overwriting it.
--
-- Safe to run once; idempotent (IF NOT EXISTS guards).

alter table public.client_notes add column if not exists gap_key text;

create index if not exists idx_client_notes_gap_key on public.client_notes (client_id, gap_key) where gap_key is not null;

-- --------------------------------------------------------------------------
-- OPTIONAL verification query -- latest reason per gap for a client:
-- --------------------------------------------------------------------------
-- select distinct on (gap_key) gap_key, text, author_name, created_at
-- from public.client_notes
-- where client_id = '<client-id>' and gap_key is not null
-- order by gap_key, created_at desc;
