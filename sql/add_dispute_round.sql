-- Adds round tracking so a returning client (same email, new engagement)
-- gets a NEW clients row instead of overwriting their previous round's
-- history (thread.json, progress, documents, payment status all live per
-- row) — see the round dropdown in ClientHeader.jsx and the duplicate-email
-- check in utils/clientDuplicateRound.js.
alter table public.clients
  add column if not exists dispute_round integer not null default 1;

-- Backfill: every existing client is implicitly "Round 1" of their email
-- (there was no round concept before this migration).
update public.clients
set dispute_round = 1
where dispute_round is null;

-- Case-insensitive lookup by email happens on every add-client submission
-- (duplicate check) and every profile load (round dropdown) — index it.
create index if not exists idx_clients_email_lower
  on public.clients using btree (lower(email));
