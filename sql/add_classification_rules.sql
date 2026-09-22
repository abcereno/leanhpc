-- sql/add_classification_rules.sql
--
-- Backs the new "AI Training Chat" feature (src/components/admin/AiTrainingChat.jsx):
-- a conversational interface where an admin teaches the classify-inquiries
-- Edge Function new standing rules in plain English (e.g. "Capital One
-- dealership inquiries should always be Do Not Dispute"), instead of only
-- the after-the-fact logging ai_training_logs already does (see
-- AITrainingFeedback.jsx / AITestingPlayground.jsx — that table is
-- write-only today; nothing reads it back into future classifications).
--
-- Two tables:
--
--   classification_chat_messages — the conversation itself. One thread per
--   client_id (a client-scoped teaching session), or a null client_id for
--   the global/all-clients thread. Each assistant message that proposes a
--   rule carries it in `proposed_rule` (jsonb) until the admin confirms it,
--   at which point `rule_id` links back to the saved row in
--   classification_rules below — so the chat transcript stays the audit
--   trail for *why* a rule exists, without duplicating its content.
--
--   classification_rules — the actual standing rules classify-inquiries
--   reads at classification time (see src/utils/classifyInquiries.js's
--   fetchClassificationRules, mirroring fetchLenderAliases). `client_id`
--   null = applies to every client (same "global" concept as
--   lender_aliases); a set client_id scopes it to that one client only.
--   `action` is deliberately free text, not an enum: the classifier only
--   ever emits linked/associated/non-linked today, and there's no
--   deterministic force-override layer yet (unlike the lender_aliases
--   guard) — these rules are read into the LLM prompt as strong natural-
--   language guidance, same mechanism as the existing alias/manual-review/
--   dealership blocks in that function, not a hard rule engine. A future
--   pass could add a real guard for a constrained action set once there's
--   evidence of which actions actually need to be force-applied rather
--   than left to the model's judgment.
--
-- Safe to run once; idempotent (IF NOT EXISTS guards).

create table if not exists public.classification_rules (
  id bigserial primary key,
  client_id uuid references public.clients(id) on delete cascade,
  rule_text text not null,
  creditor_pattern text,
  action text,
  active boolean not null default true,
  created_by uuid,
  created_by_name text,
  source_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_classification_rules_client
  on public.classification_rules (client_id);

create index if not exists idx_classification_rules_active
  on public.classification_rules (active) where active;

alter table public.classification_rules enable row level security;

-- Same broad-read posture as lender_aliases (classify-inquiries fetches
-- this client-side with the anon key, same as it does lenderAliases) —
-- write access is left open to any authenticated user rather than locked
-- to a specific role, since the AI Training Chat page itself is already
-- gated by the train_ai_rules permission at the route level
-- (src/utils/permissions.js / App.jsx), matching this app's general
-- pattern of enforcing access in the UI/route layer, not fine-grained RLS.
drop policy if exists "anyone can read classification rules" on public.classification_rules;
create policy "anyone can read classification rules"
  on public.classification_rules for select
  using (true);

drop policy if exists "authenticated can write classification rules" on public.classification_rules;
create policy "authenticated can write classification rules"
  on public.classification_rules for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create table if not exists public.classification_chat_messages (
  id bigserial primary key,
  client_id uuid references public.clients(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  proposed_rule jsonb,
  rule_id bigint references public.classification_rules(id) on delete set null,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_classification_chat_messages_client
  on public.classification_chat_messages (client_id, created_at);

alter table public.classification_chat_messages enable row level security;

drop policy if exists "authenticated can read training chat" on public.classification_chat_messages;
create policy "authenticated can read training chat"
  on public.classification_chat_messages for select
  using (auth.role() = 'authenticated');

drop policy if exists "authenticated can write training chat" on public.classification_chat_messages;
create policy "authenticated can write training chat"
  on public.classification_chat_messages for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- --------------------------------------------------------------------------
-- OPTIONAL verification queries:
-- --------------------------------------------------------------------------
-- select * from public.classification_rules where active order by created_at desc;
-- select * from public.classification_chat_messages order by created_at desc limit 50;
