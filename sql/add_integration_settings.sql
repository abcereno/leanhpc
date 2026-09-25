-- Generic per-integration settings store, admin-only. Replaces hardcoded
-- webhook URLs scattered across the frontend (LogDocumentModal.jsx,
-- completionWebhook.js, useBureauWebhookDispatcher.js, IndividualLayout.jsx)
-- with rows here, editable from the new admin Integration Settings page
-- (src/components/admin/IntegrationSettings.jsx) instead of a code deploy.
--
-- One row per named webhook rather than a single "highlevel_webhook_url" —
-- the 4 existing hardcoded URLs each point at a DIFFERENT LeadConnector
-- webhook-trigger id (i.e. different GHL workflows), so collapsing them
-- into one URL would silently break whichever GHL automations are keyed
-- off those distinct trigger ids. Each key keeps its own destination;
-- staff can still point two keys at the same URL from the UI if they want
-- to actually consolidate on the GHL side.
create table if not exists integration_settings (
  key text primary key,
  value text,
  label text not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

alter table integration_settings enable row level security;

drop policy if exists "integration_settings_admin_staff_all" on integration_settings;
create policy "integration_settings_admin_staff_all"
  on integration_settings
  for all
  using (is_admin_staff())
  with check (is_admin_staff());

-- Seed with the existing hardcoded values so nothing breaks on migration —
-- staff can then edit/rotate them from the Integration Settings page.
-- The new CS Dashboard events key is seeded NULL/on purpose: there's no
-- existing URL for it, an admin has to paste one in before those 4 new
-- event types (client_completed/needs_more_documents/
-- processing_stage_changed/payment_status_changed) actually send anywhere
-- — sendHighLevelEvent() below silently no-ops until a URL is set.
insert into integration_settings (key, value, label, description) values
  (
    'highlevel_cs_webhook_url',
    null,
    'CS Dashboard Events (HighLevel)',
    'Fires client_completed, needs_more_documents, processing_stage_changed, and payment_status_changed events to one GHL workflow.'
  ),
  (
    'highlevel_completion_webhook_url',
    'https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/423af280-1504-4014-9f5e-f10b9bbc0985',
    'Bureau Completion Webhook (HighLevel)',
    'Fires client_completed / bureau_completed when a dispute round finishes (src/utils/completionWebhook.js).'
  ),
  (
    'highlevel_document_logged_webhook_url',
    'https://services.leadconnectorhq.com/hooks/rqr5oOzXxiHjh8wSS7T2/webhook-trigger/74390dd8-3c06-4cd3-9ff3-1f2295f902f8',
    'Document Logged Webhook (HighLevel)',
    'Fires document_logged whenever staff log a document submission (LogDocumentModal.jsx).'
  ),
  (
    'highlevel_bureau_exp_webhook_url',
    'https://services.leadconnectorhq.com/hooks/rqr5oOzXxiHjh8wSS7T2/webhook-trigger/YAGaU7IgBAweA8krfhqQ',
    'Bureau Call Webhook — Experian (HighLevel)',
    'Fires on Experian call-log dispatch (useBureauWebhookDispatcher.js).'
  ),
  (
    'highlevel_bureau_tu_webhook_url',
    'https://services.leadconnectorhq.com/hooks/rqr5oOzXxiHjh8wSS7T2/webhook-trigger/TkH0imUJPpA9k0zy7icf',
    'Bureau Call Webhook — TransUnion (HighLevel)',
    'Fires on TransUnion call-log dispatch (useBureauWebhookDispatcher.js).'
  ),
  (
    'highlevel_bureau_eq_webhook_url',
    'https://services.leadconnectorhq.com/hooks/rqr5oOzXxiHjh8wSS7T2/webhook-trigger/QPAvlhWtjMcc4oaGW1aY',
    'Bureau Call Webhook — Equifax (HighLevel)',
    'Fires on Equifax call-log dispatch (useBureauWebhookDispatcher.js).'
  ),
  (
    'highlevel_individual_webhook_url',
    'https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/36c7c9da-355a-46ad-826b-2b378a560212',
    'Individual Portal Webhook (HighLevel)',
    'Fires on individual-portal payment/move-forward events (IndividualLayout.jsx).'
  )
on conflict (key) do nothing;
