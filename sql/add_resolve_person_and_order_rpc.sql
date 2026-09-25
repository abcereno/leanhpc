-- sql/add_resolve_person_and_order_rpc.sql
--
-- Phase 2 support for Client/Order/Round separation (see
-- sql/add_client_identity_orders.sql for the full "why this shape" writeup
-- and the person/order matching rules this function mirrors).
--
-- WHY A SECURITY DEFINER RPC INSTEAD OF DIRECT TABLE WRITES FROM THE APP:
-- people/orders RLS only allows is_admin_staff() (see
-- add_client_identity_orders.sql). Of the 7 add-client forms, 4 run as
-- non-staff callers:
--   - src/components/company/AddClientModal.jsx      (company portal)
--   - src/components/company/NewLeadForm.jsx          (company portal)
--   - src/components/broker/BrokerAddClientForm.jsx   (broker portal)
--   - src/components/shared/public/AddClientForm.jsx  (fully public, no
--     authenticated session at all — an unauthenticated lead-intake link)
-- None of those roles pass is_admin_staff(), so a direct
-- supabase.from("people").insert(...) from those forms would be rejected
-- by RLS. Rather than widening people/orders RLS to company/broker/anon
-- (which add_client_identity_orders.sql explicitly deferred pending a real
-- access-design pass for Phase 3), this function does ONLY the narrow
-- find-or-create operation below under elevated privileges — no arbitrary
-- reads, no deletes, nothing beyond resolving/creating exactly one person
-- row and one order row per call. It's granted to anon because the public
-- intake form already lets anonymous visitors create `clients` rows today
-- (see AddClientForm.jsx) — this doesn't expand that existing trust
-- boundary, just extends it consistently to the two new tables.
--
-- Called from src/utils/clientDuplicateRound.js's insertClientRecord(),
-- the single shared choke point all 7 add-client forms already insert
-- clients rows through — so wiring happens there once, not in 7 separate
-- files.
--
-- Safe to re-run (create or replace).

create or replace function public.resolve_person_and_order(
  p_full_name text,
  p_email text,
  p_phone text,
  p_dob date,
  p_ssn text,
  p_address text,
  p_service_id text,
  p_dispute_method text,
  p_company_id uuid
) returns table(person_id uuid, order_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
  v_order_id uuid;
  v_service_key text;
begin
  -- Same matching rule as add_client_identity_orders.sql's backfill: exact
  -- (case/whitespace-insensitive) email match, except blank/placeholder
  -- emails always get their own new person (see that file's EDGE CASES #2).
  if p_email is null or trim(p_email) = '' or p_email ilike 'quickimport-%@pending.com' then
    insert into public.people (full_name, email, phone, dob, ssn, address)
    values (p_full_name, p_email, p_phone, p_dob, p_ssn, p_address)
    returning id into v_person_id;
  else
    select id into v_person_id from public.people
    where lower(email) = lower(trim(p_email))
    limit 1;

    if v_person_id is null then
      insert into public.people (full_name, email, phone, dob, ssn, address)
      values (p_full_name, p_email, p_phone, p_dob, p_ssn, p_address)
      returning id into v_person_id;
    else
      -- Fill blanks only, never overwrite good existing data — same
      -- rationale as the backfill (later rounds often have MORE complete
      -- info than the original intake, but never worse).
      update public.people set
        full_name = coalesce(nullif(full_name, ''), p_full_name),
        phone = coalesce(nullif(phone, ''), p_phone),
        dob = coalesce(dob, p_dob),
        ssn = coalesce(nullif(ssn, ''), p_ssn),
        address = coalesce(nullif(address, ''), p_address),
        updated_at = now()
      where id = v_person_id;
    end if;
  end if;

  v_service_key := coalesce(p_service_id, lower(trim(p_dispute_method)), 'unknown');

  select o.id into v_order_id from public.orders o
  where o.person_id = v_person_id
    and coalesce(o.service_id, lower(trim(o.dispute_method)), 'unknown') = v_service_key
  limit 1;

  if v_order_id is null then
    insert into public.orders (person_id, service_id, dispute_method, company_id)
    values (v_person_id, p_service_id, p_dispute_method, p_company_id)
    returning id into v_order_id;
  end if;

  return query select v_person_id, v_order_id;
end;
$$;

grant execute on function public.resolve_person_and_order(
  text, text, text, date, text, text, text, text, uuid
) to anon, authenticated;
