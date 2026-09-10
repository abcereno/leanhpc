-- sql/add_client_identity_orders.sql
--
-- ⚠️ PHASE 1 DRAFT — FOR REVIEW BEFORE RUNNING. This backfills real
-- identity/order groupings onto ~600+ live client rows using a best-effort
-- matching rule (email). Read the whole file, especially the "EDGE CASES"
-- section below, before running this against production.
--
-- ============================================================================
-- WHY THIS SHAPE
-- ============================================================================
-- Today, `clients` is one row per ROUND — every "resubmit" (see
-- utils/clientDuplicateRound.js) inserts a brand-new clients row, so the
-- same person doing Inquiry Processing twice and Fraud Alert Removal once
-- is 3 separate, disconnected rows with no shared identity between them.
-- That's the exact problem behind wanting "+ New Order" instead of a blank
-- intake form every time.
--
-- The fix is NOT to replace `clients` with a new table — 67 files across
-- this app (documents, letters, invoices, document routing, the inquiries
-- thread, financial records, comments, support chat...) all join on
-- `client_id` treating a clients row as one unit of work. Re-pointing all
-- of that would be a multi-week rewrite with real regression risk for no
-- functional gain, since `clients` is already at the right grain to *be*
-- the "Round" table.
--
-- So instead, this adds two new tables ABOVE `clients` and leaves every
-- existing relationship untouched:
--   people  — the real identity: name, email, phone, DOB, SSN, address.
--             One row per actual person, however many rounds/orders they have.
--   orders  — one row per distinct SERVICE ENGAGEMENT. A second round of
--             the same service (e.g. Inquiry Processing Round 2) is the
--             SAME order as Round 1. A different service (e.g. Fraud Alert
--             Removal) is a NEW order, even for the same person.
--   clients — unchanged, gets two new nullable FK columns (person_id,
--             order_id) so every existing round still is, and always was,
--             a `clients` row — just now it also knows which person and
--             which order it belongs to.
--
-- ============================================================================
-- EDGE CASES IN THE BACKFILL BELOW — READ BEFORE RUNNING
-- ============================================================================
-- 1. Grouping key is lower(trim(email)). Any two clients rows with the same
--    email become the same person. This is the same identity signal
--    utils/clientDuplicateRound.js and client_report_snapshots already use
--    elsewhere in this app — it's not a new assumption, just formalized.
--
-- 2. Rows with a NULL/blank email, OR an auto-generated placeholder email
--    matching `quickimport-<id>@pending.com` (see markClientPaid.js's
--    guaranteedClientEmail — used for unpaid leads with no real email on
--    file), get their OWN person — they can't be reliably matched to
--    anyone else. If two of these placeholder rows are secretly the same
--    real person, this backfill will NOT merge them. That needs a manual
--    "merge people" pass later if it matters for old data.
--
-- 3. Two different real emails for the same actual human (a typo, a
--    changed email) will NOT be detected or merged — this script has no
--    fuzzy-matching, only exact (case/whitespace-insensitive) email match.
--
-- 4. "Same order" = same person + same normalized service
--    (service_id if backfilled, else lower(trim(dispute_method))). If a
--    person's service value is inconsistent across rounds due to a typo
--    (e.g. "credit repair" vs "Credit Repair " with trailing space — this
--    is trimmed/lowercased so that specific case is handled, but a
--    genuinely different misspelling would NOT match and would incorrectly
--    create a second order).
--
-- 5. Idempotent / safe to re-run: only processes clients rows where
--    person_id IS NULL, and re-uses an existing people/orders row if one
--    already matches, so an interrupted run or accidental second run does
--    not duplicate anything.
--
-- 6. This migration does NOT touch is_paid, progress, documents, or any
--    other existing clients column, and does NOT delete or merge any
--    existing clients rows — it is purely additive. Nothing in the current
--    app breaks or changes behavior after running this; person_id/order_id
--    are unused by any existing code path until Phase 2/3 are built.
--
-- ============================================================================

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text,
  phone text,
  dob date,
  ssn text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_people_email on public.people (lower(email));

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  -- Mirrors clients.service_id/dispute_method's dual-column pattern
  -- (utils/services.js) — service_id is the canonical value going forward,
  -- dispute_method is kept for legacy display/matching.
  service_id text,
  dispute_method text,
  company_id uuid references public.companies(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_orders_person_id on public.orders (person_id);

alter table public.clients add column if not exists person_id uuid references public.people(id);
alter table public.clients add column if not exists order_id uuid references public.orders(id);
create index if not exists idx_clients_person_id on public.clients (person_id);
create index if not exists idx_clients_order_id on public.clients (order_id);

alter table public.people enable row level security;
alter table public.orders enable row level security;

drop policy if exists "staff can read people" on public.people;
create policy "staff can read people" on public.people for select using (public.is_admin_staff());
drop policy if exists "staff can write people" on public.people;
create policy "staff can write people" on public.people for all using (public.is_admin_staff()) with check (public.is_admin_staff());

drop policy if exists "staff can read orders" on public.orders;
create policy "staff can read orders" on public.orders for select using (public.is_admin_staff());
drop policy if exists "staff can write orders" on public.orders;
create policy "staff can write orders" on public.orders for all using (public.is_admin_staff()) with check (public.is_admin_staff());
-- NOTE: company/broker portal read policies for people/orders are
-- deliberately NOT included here — Phase 3 (the grouped list view + New
-- Order UI) needs to decide exactly how a partner's access should be
-- scoped (probably: orders/people reachable only through a clients row
-- whose company_id they already have access to) before opening this up
-- beyond admin. Don't widen this without that design pass.

-- ============================================================================
-- BACKFILL — only touches clients rows where person_id IS NULL (safe to re-run)
-- ============================================================================
do $$
declare
  r record;
  v_person_id uuid;
  v_order_id uuid;
  v_service_key text;
begin
  for r in
    select * from public.clients
    where person_id is null
    order by created_at asc
  loop
    if r.email is null or trim(r.email) = '' or r.email ilike 'quickimport-%@pending.com' then
      insert into public.people (full_name, email, phone, dob, ssn, address)
      values (r.full_name, r.email, r.phone, r.dob, r.ssn, r.address)
      returning id into v_person_id;
    else
      select id into v_person_id from public.people
      where lower(email) = lower(trim(r.email))
      limit 1;

      if v_person_id is null then
        insert into public.people (full_name, email, phone, dob, ssn, address)
        values (r.full_name, r.email, r.phone, r.dob, r.ssn, r.address)
        returning id into v_person_id;
      else
        -- Fill blanks from this round rather than overwriting good data —
        -- later rounds often have MORE complete info (DOB/SSN collected
        -- after the fact) than the original intake, but never worse.
        update public.people set
          full_name = coalesce(nullif(full_name, ''), r.full_name),
          phone = coalesce(nullif(phone, ''), r.phone),
          dob = coalesce(dob, r.dob),
          ssn = coalesce(nullif(ssn, ''), r.ssn),
          address = coalesce(nullif(address, ''), r.address),
          updated_at = now()
        where id = v_person_id;
      end if;
    end if;

    v_service_key := coalesce(r.service_id, lower(trim(r.dispute_method)), 'unknown');

    select id into v_order_id from public.orders
    where person_id = v_person_id
      and coalesce(service_id, lower(trim(dispute_method)), 'unknown') = v_service_key
    limit 1;

    if v_order_id is null then
      insert into public.orders (person_id, service_id, dispute_method, company_id, created_at)
      values (v_person_id, r.service_id, r.dispute_method, r.company_id, r.created_at)
      returning id into v_order_id;
    end if;

    update public.clients set person_id = v_person_id, order_id = v_order_id
    where id = r.id;
  end loop;
end $$;

-- ============================================================================
-- VERIFICATION QUERIES — run these AFTER backfilling to sanity-check results
-- before building any UI on top of this. Every number here is worth
-- eyeballing against what you'd expect from your actual client list.
-- ============================================================================

-- How many distinct people did ~600+ client rows collapse into?
-- select count(*) as total_people from public.people;

-- How many orders (service engagements) total, and average rounds per order?
-- select count(*) as total_orders from public.orders;
-- select o.id, count(c.id) as round_count
-- from public.orders o join public.clients c on c.order_id = o.id
-- group by o.id order by round_count desc limit 20;

-- Spot-check a specific person by email — should show every round across
-- every service they've ever had, grouped correctly under 1-2 orders:
-- select p.full_name, p.email, o.service_id, o.dispute_method, c.dispute_round, c.created_at
-- from public.people p
-- join public.orders o on o.person_id = p.id
-- join public.clients c on c.order_id = o.id
-- where lower(p.email) = lower('someone@example.com')
-- order by o.created_at, c.dispute_round;

-- Rows that fell into the "no reliable email" bucket (each got its own
-- person) — worth a manual glance to see how many there are:
-- select count(*) from public.clients
-- where email is null or trim(email) = '' or email ilike 'quickimport-%@pending.com';
