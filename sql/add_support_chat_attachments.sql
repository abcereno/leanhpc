-- sql/add_support_chat_attachments.sql
--
-- Lets a support chat message (sql/add_support_chat.sql) carry a file —
-- screenshots being the main driver, but any file type. Reuses the
-- existing public "uploads" storage bucket (already used by
-- CompanyVisionBoard.jsx/VisionBoardView.jsx for image uploads) under a
-- support-chat/ prefix rather than provisioning a new bucket — same
-- public-bucket-with-unguessable-path model already accepted for every
-- other client-facing upload in this codebase (clients/uploads buckets),
-- so this doesn't introduce a stricter or looser security posture than
-- what's already there.
--
-- Run this in the Supabase SQL editor. Safe to run more than once.

alter table public.support_messages
  add column if not exists attachment_url text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text;

-- `body` was `not null` — a message can now be JUST an attachment (e.g.
-- pasting a screenshot with no caption), so it has to allow null/empty.
alter table public.support_messages
  alter column body drop not null;

alter table public.support_messages
  drop constraint if exists support_messages_body_or_attachment;
alter table public.support_messages
  add constraint support_messages_body_or_attachment
  check (
    (body is not null and length(trim(body)) > 0)
    or attachment_url is not null
  );
