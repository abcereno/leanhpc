-- Dedicated public-link token for the client-facing "Classic Report" page
-- (src/components/shared/public/ClassicReportPage.jsx, route
-- /classic-report/:token). Deliberately NOT reusing clients.public_token —
-- that column already has a single owner, the receipt flow
-- (useReceiptGenerator.js / PublicClientReceipt.jsx), and gets reset to
-- null after every SmartCredit fetch (Fetch3bModal.jsx). Sharing it here
-- would mean generating a Classic Report link silently invalidates any
-- live receipt link a client has, and vice versa, with no way to tell
-- which purpose a given token was for. Same pattern otherwise: a random
-- token, a 24-hour expiry, and a viewed flag for basic "did they open it"
-- telemetry — mirrors public_token/public_token_expires_at/
-- public_token_viewed exactly.
alter table public.clients
  add column if not exists classic_report_token text,
  add column if not exists classic_report_token_expires_at timestamptz,
  add column if not exists classic_report_token_viewed boolean default false;

create index if not exists idx_clients_classic_report_token
  on public.clients (classic_report_token)
  where classic_report_token is not null;
