-- Run this once in Supabase → SQL Editor → New query.
-- Restores creator memberships and the household lookup used by older deployed clients.
insert into public.household_members (household_id, user_id, display_name)
select h.id,
       h.created_by,
       coalesce(nullif(split_part(u.email, '@', 1), ''), 'You')
from public.households h
join auth.users u on u.id = h.created_by
where not exists (
  select 1 from public.household_members hm
  where hm.user_id = h.created_by
)
on conflict do nothing;

create or replace function public.current_household()
returns table (id uuid, name text, invite_code text)
language sql security definer set search_path = public stable as $$
  select h.id, h.name, h.invite_code
  from public.households h
  join public.household_members hm on hm.household_id = h.id
  where hm.user_id = auth.uid()
  order by h.created_at
  limit 1;
$$;

grant execute on function public.current_household() to authenticated;
revoke execute on function public.current_household() from public;
notify pgrst, 'reload schema';
