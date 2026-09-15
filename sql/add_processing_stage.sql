-- sql/add_processing_stage.sql
--
-- Backs the new manually-selected "Processing" stage on the Operational
-- Timeline (ClientSummaryModal.jsx) — see src/utils/processingStage.js for
-- the 5 allowed values and their display labels. Staff pick one from a
-- fixed dropdown instead of the step just reading generic "In Progress"
-- for the entire dispute cycle.
--
-- Simple version (current stage only, no history table) per explicit
-- choice — matches how every other Operational Timeline step
-- (Payment/Documents/Complete) already works: one value + one timestamp
-- for when it last changed.
--
-- Safe to re-run.

alter table public.clients add column if not exists processing_stage text;
alter table public.clients add column if not exists processing_stage_updated_at timestamptz;

-- Loose check constraint (not a hard enum type) matching this codebase's
-- existing convention for similar fields (e.g. dispute_method/service_id in
-- utils/services.js) — validated at the application layer
-- (src/utils/processingStage.js's PROCESSING_STAGES list is the source of
-- truth), DB just guards against stray/typo'd values slipping in outside
-- the app.
alter table public.clients drop constraint if exists clients_processing_stage_check;
alter table public.clients add constraint clients_processing_stage_check
  check (
    processing_stage is null or processing_stage in (
      'letter_sent',
      'awaiting_bureaus',
      'bureau_response_received',
      're_dispute_in_progress',
      'results_finalizing'
    )
  );
