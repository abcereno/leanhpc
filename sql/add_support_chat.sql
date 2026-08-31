-- sql/add_support_chat.sql
--
-- Real-time support chat between individuals/partners and HPC admin staff.
-- Both portal types only ever talk to admin (no individual<->partner
-- messaging) — one thread per client (individual) or per company
-- (shared across all of that company's agents, same as every other
-- company-scoped resource in this app), never both.
--
-- Schema mirrors sql/payment_verifications_company_support.sql's
-- nullable-client_id/nullable-company_id + "exactly one owner" CHECK
-- pattern rather than inventing a new owner-type/owner-id shape, so this
-- stays consistent with how the rest of the app already models "belongs
-- to a client OR a company, never neither/both".
--
-- Replaces the never-actually-wired-up `communications` table read by
-- src/components/admin/customer-service/dashboard-tabs/MessagesTab.jsx —
-- that table doesn't exist in this schema (confirmed via schema.json),
-- so that tab was dead code querying a table that was never created.
-- This migration doesn't touch that file; it's a separate SMS/GHL-log
-- concept, not this feature.
--
-- Run this in the Supabase SQL editor. Safe to run more than once
-- (drop-then-recreate policies).

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  sender_name text,
  sender_type text not null check (sender_type in ('individual', 'company', 'admin')),
  body text not null,
  read_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.support_messages
  drop constraint if exists support_messages_exactly_one_owner;
alter table public.support_messages
  add constraint support_messages_exactly_one_owner
  check (num_nonnulls(client_id, company_id) = 1);

create index if not exists idx_support_messages_client
  on public.support_messages using btree (client_id, created_at);
create index if not exists idx_support_messages_company
  on public.support_messages using btree (company_id, created_at);
-- Powers the admin inbox's unread-count query — partial index since most
-- rows will be read_by_admin = true and this only ever filters for false.
create index if not exists idx_support_messages_unread
  on public.support_messages using btree (created_at) where (read_by_admin = false);

alter table public.support_messages enable row level security;

-- 1. Admin staff — full read/write on every thread, matches the same
--    public.is_admin_staff() helper already used across the rest of this
--    codebase (see sql/add_client_documents_update_policy.sql,
--    sql/count_review_v2.sql) rather than redefining role checks here.
drop policy if exists "admin staff can view all support messages" on public.support_messages;
create policy "admin staff can view all support messages"
  on public.support_messages for select
  using (public.is_admin_staff());

drop policy if exists "admin staff can send support messages" on public.support_messages;
create policy "admin staff can send support messages"
  on public.support_messages for insert
  with check (public.is_admin_staff() and sender_type = 'admin' and sender_id = auth.uid());

-- Only admin needs to flip read_by_admin — neither portal side has a
-- read-receipt UI in this first version, so there's nothing for them to
-- update.
drop policy if exists "admin staff can mark support messages read" on public.support_messages;
create policy "admin staff can mark support messages read"
  on public.support_messages for update
  using (public.is_admin_staff())
  with check (public.is_admin_staff());

-- 2. Individual portal clients — only their own thread, same
--    clients.auth_user_id = auth.uid() scoping used throughout (see
--    sql/count_review_v2.sql, sql/add_client_documents_update_policy.sql).
drop policy if exists "individuals can view their own support thread" on public.support_messages;
create policy "individuals can view their own support thread"
  on public.support_messages for select
  using (
    client_id is not null
    and exists (
      select 1 from public.clients c
      where c.id = support_messages.client_id
        and c.auth_user_id = auth.uid()
    )
  );

drop policy if exists "individuals can send to their own support thread" on public.support_messages;
create policy "individuals can send to their own support thread"
  on public.support_messages for insert
  with check (
    sender_type = 'individual'
    and sender_id = auth.uid()
    and client_id is not null
    and exists (
      select 1 from public.clients c
      where c.id = support_messages.client_id
        and c.auth_user_id = auth.uid()
    )
  );

-- 3. Company/partner portal users — their own company's thread, shared
--    across every agent at that company (same company_user_profiles ->
--    company_id scoping as sql/count_review_v2.sql and
--    sql/add_client_documents_update_policy.sql), not one thread per agent.
drop policy if exists "company users can view their own company support thread" on public.support_messages;
create policy "company users can view their own company support thread"
  on public.support_messages for select
  using (
    company_id is not null
    and exists (
      select 1 from public.company_user_profiles cup
      where cup.id = auth.uid() and cup.company_id = support_messages.company_id
    )
  );

drop policy if exists "company users can send to their own company support thread" on public.support_messages;
create policy "company users can send to their own company support thread"
  on public.support_messages for insert
  with check (
    sender_type = 'company'
    and sender_id = auth.uid()
    and company_id is not null
    and exists (
      select 1 from public.company_user_profiles cup
      where cup.id = auth.uid() and cup.company_id = support_messages.company_id
    )
  );

-- Realtime: SupportChatThread.jsx subscribes via postgres_changes (same
-- mechanism MessagesTab.jsx already uses elsewhere in this codebase) —
-- that requires the table to be in the supabase_realtime publication.
-- Harmless no-op if it's already there.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end $$;

-- --------------------------------------------------------------------------
-- OPTIONAL verification query — run after sending a test message as each
-- of the three sender types, confirm each can see only what it should:
-- --------------------------------------------------------------------------
-- select id, client_id, company_id, sender_type, sender_name, body, read_by_admin, created_at
-- from public.support_messages
-- order by created_at desc
-- limit 20;
