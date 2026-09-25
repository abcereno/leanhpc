-- sql/add_search_people_rpc.sql
--
-- Phase 3's "smarter New Client dedup": lets a New Client form search
-- existing people by name/email/phone BEFORE staff fill out and submit a
-- whole new record. The only existing duplicate check
-- (clientDuplicateRound.js's resolveRoundForNewClient) is exact-email-match
-- only, applied at submit time — it can't catch a returning client typing
-- their name with a different email than the one on file. This is a wider,
-- earlier check; it's advisory only and doesn't change what happens on
-- submit.
--
-- WHY A SECURITY DEFINER RPC INSTEAD OF A DIRECT SELECT:
-- people/orders RLS is is_admin_staff()-only (see
-- add_client_identity_orders.sql), and per this session's Phase 3 scoping
-- decision, this dedup search is admin-only (the 3 staff add-client forms
-- — AddClientSidebar.jsx, AddClientFormStandard.jsx, SmartIdiQModal.jsx —
-- not the company/broker/public ones). A direct client-side
-- supabase.from("people").select(...) would already pass RLS for a staff
-- caller, so strictly a plain SELECT policy would suffice here — but this
-- goes through a function anyway so the is_admin_staff() check is
-- enforced server-side regardless of what RLS ends up granted later (e.g.
-- if a future Phase widens people/orders SELECT to company/broker roles
-- for other reasons, this search wouldn't silently open up along with it).
--
-- Safe to re-run (create or replace).

create or replace function public.search_people(p_query text)
returns table(
  person_id uuid,
  full_name text,
  email text,
  phone text,
  order_count bigint,
  latest_client_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_staff() then
    raise exception 'not authorized';
  end if;

  if p_query is null or length(trim(p_query)) < 2 then
    return;
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.email,
    p.phone,
    count(distinct o.id) as order_count,
    -- Most recent clients row for this person — lets the caller link
    -- straight to their existing profile (/clients/:id, already routed)
    -- instead of needing new deep-link plumbing in AdminClientList.jsx.
    (
      select c.id from public.clients c
      where c.person_id = p.id
      order by c.created_at desc
      limit 1
    ) as latest_client_id
  from public.people p
  left join public.orders o on o.person_id = p.id
  where
    p.full_name ilike '%' || p_query || '%'
    or p.email ilike '%' || p_query || '%'
    or p.phone ilike '%' || p_query || '%'
  group by p.id
  order by p.full_name
  limit 20;
end;
$$;

grant execute on function public.search_people(text) to authenticated;
