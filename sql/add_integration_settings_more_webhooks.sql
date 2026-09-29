-- Follow-up to sql/add_integration_settings.sql — a broader grep for
-- "leadconnectorhq" turned up 6 MORE hardcoded HighLevel webhook URLs that
-- the original sweep's subagent search missed (SupportConsole.jsx,
-- PendingApprovals.jsx, ClientSubmissionListener.jsx,
-- useReceiptGenerator.js, and 2 inside markClientPaid.js's PAID_WEBHOOKS
-- array). Same reasoning as the original file: one row per URL, since each
-- points at a distinct GHL workflow trigger id.
--
-- Two OTHER hardcoded URLs found in the same sweep (reportStorage.js's
-- DELTA_WEBHOOK_URL and ProfileDashboard.jsx's webhookUrl) are NOT new
-- rows here — they're duplicate hardcoded copies of URLs already seeded in
-- add_integration_settings.sql (highlevel_completion_webhook_url and
-- highlevel_individual_webhook_url respectively), so those two call sites
-- just get pointed at the existing keys instead of adding redundant ones.
insert into integration_settings (key, value, label, description) values
  (
    'highlevel_support_console_webhook_url',
    'https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/9ecfe892-5e69-4882-8b58-a6401bc839d3',
    'Support Console Webhook (HighLevel)',
    'Fires lead-capture, action-button, and post-call-survey events from the admin Support Console (SupportConsole.jsx).'
  ),
  (
    'highlevel_pending_approvals_webhook_url',
    'https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/99d2a895-5978-474b-8667-464e4a0c780b',
    'Pending Approvals Webhook (HighLevel)',
    'Fires user_approved when a pending client/company/affiliate is approved (PendingApprovals.jsx).'
  ),
  (
    'highlevel_client_grabbed_webhook_url',
    'https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/c96adb2a-4e80-4183-8292-175a44993269',
    'Client Grabbed Webhook (HighLevel)',
    'Fires client_grabbed when staff claim a client from the FAB queue (ClientSubmissionListener.jsx).'
  ),
  (
    'highlevel_receipt_webhook_url',
    'https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/61da67a8-c2e3-4b99-b13f-74c08f0847fd',
    'Receipt Link Webhook (HighLevel)',
    'Fires receipt_link_generated when staff generate a client receipt link (useReceiptGenerator.js).'
  ),
  (
    'highlevel_paid_webhook_1_url',
    'https://services.leadconnectorhq.com/hooks/rqr5oOzXxiHjh8wSS7T2/webhook-trigger/775e674e-e9dd-43df-852f-574865edcc84',
    'Mark Paid Webhook 1 (HighLevel)',
    'One of two webhooks fired every time a client is marked paid (markClientPaid.js).'
  ),
  (
    'highlevel_paid_webhook_2_url',
    'https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/236315bf-1d68-419b-b8aa-f6afaafcc39c',
    'Mark Paid Webhook 2 (HighLevel)',
    'The other of two webhooks fired every time a client is marked paid (markClientPaid.js).'
  )
on conflict (key) do nothing;
