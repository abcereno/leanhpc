-- sql/add_partner_client_edits.sql
--
-- Lets company/partner portal users edit a client's contact info (email,
-- phone, address) from ClientProfilePage.jsx, with a visible marker on the
-- admin side (ClientHeader.jsx's Personal Info column) so staff notice a
-- partner changed something rather than a silent, unattributed update.
--
-- No RLS change needed here: company-portal users already have UPDATE
-- access to their own company's `clients` rows (ClientProfilePage.jsx
-- already writes inquiries_locked/inquiries_signature_url directly from
-- this same table). This migration only adds the marker columns; see
-- utils/partnerClientEdit.js for the write path and its graceful
-- degradation if this hasn't been run yet.

alter table public.clients
  add column if not exists partner_updated_at timestamptz,
  add column if not exists partner_updated_by uuid references public.company_user_profiles(id),
  add column if not exists partner_updated_by_name text;
