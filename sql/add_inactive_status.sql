-- sql/add_inactive_status.sql
--
-- Adds an "Inactive" status to clients, separate from is_paused
-- (sql/add_pause_reason.sql). Pause is a temporary hold that's expected
-- to resume ("waiting on documents") — clients stay in their normal tabs
-- while paused, just visually badged. Inactive is for a client who's
-- stopped engaging entirely (cancelled, gone dark, etc.) and should drop
-- OUT of the normal working tabs (Paid/Unpaid/Not Completed/Completed/
-- All Clients) into its own dedicated Inactive tab instead — see
-- src/hooks/useAdminClients.js's filteredClientList and
-- src/components/admin/AdminClientList.jsx's tab bar.
--
-- is_inactive / inactive_reason / inactivated_at mirror the is_paused /
-- pause_reason / paused_at columns' shape exactly (see ClientHeader.jsx's
-- Status dropdown, src/hooks/useClientActions.js#toggleInactive) — same
-- required-reason UX via ConfirmDialog.jsx, just a distinct flag so a
-- client can be independently paused AND inactive without the two
-- states overwriting each other.
--
-- Safe to run once; idempotent (IF NOT EXISTS guards).

alter table public.clients add column if not exists is_inactive boolean not null default false;
alter table public.clients add column if not exists inactive_reason text;
alter table public.clients add column if not exists inactivated_at timestamptz;

create index if not exists idx_clients_is_inactive on public.clients (is_inactive);
