-- Run this once in Supabase → SQL Editor → New query.
-- It fixes loading an existing household immediately after creating or signing in.
create or replace function public.current_household()
returns table (id uuid, name text, invite_code text)
language sql security definer set search_path = public stable as $$
  select h.id, h.name, h.invite_code
  from public.households h
  join public.household_members hm on hm.household_id = h.id
  where hm.user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_household() to authenticated;
revoke execute on function public.current_household() from public;
