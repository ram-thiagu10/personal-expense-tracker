-- Run once in Supabase SQL Editor to enable the household roster and dynamic personal owners.
alter table public.expenses
  drop constraint if exists expenses_person_check;

drop policy if exists "members view own membership" on public.household_members;
drop policy if exists "members view household roster" on public.household_members;
create policy "members view household roster" on public.household_members
  for select using (public.is_household_member(household_id));
