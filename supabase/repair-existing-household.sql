-- Run this ONCE in Supabase → SQL Editor → New query.
-- Safe to run more than once. It restores a missing creator membership and
-- provides the signed-in household lookup used by the app.

insert into public.household_members (household_id, user_id, display_name)
select h.id,
       h.created_by,
       coalesce(nullif(split_part(u.email, '@', 1), ''), 'You')
from public.households h
join auth.users u on u.id = h.created_by
where not exists (
  select 1 from public.household_members hm
  where hm.household_id = h.id and hm.user_id = h.created_by
)
on conflict (household_id, user_id) do nothing;

create or replace function public.current_household()
returns table (id uuid, name text, invite_code text)
language sql security definer set search_path = public stable as $$
  select h.id, h.name, h.invite_code
  from public.households h
  where h.created_by = auth.uid()
     or exists (
       select 1 from public.household_members hm
       where hm.household_id = h.id and hm.user_id = auth.uid()
     )
  order by h.created_at
  limit 1;
$$;

grant execute on function public.current_household() to authenticated;
revoke execute on function public.current_household() from public;
