-- Run once in Supabase SQL Editor for an existing project.
create table if not exists public.household_budgets (
  household_id uuid not null references public.households(id) on delete cascade,
  budget_month date not null check (extract(day from budget_month) = 1),
  amount numeric(12,2) not null check (amount > 0),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (household_id, budget_month)
);

alter table public.household_budgets enable row level security;

drop policy if exists "members view household budgets" on public.household_budgets;
drop policy if exists "members add household budgets" on public.household_budgets;
drop policy if exists "members update household budgets" on public.household_budgets;
create policy "members view household budgets" on public.household_budgets for select using (public.is_household_member(household_id));
create policy "members add household budgets" on public.household_budgets for insert with check (public.is_household_member(household_id));
create policy "members update household budgets" on public.household_budgets for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

create table if not exists public.personal_budgets (
  household_id uuid not null references public.households(id) on delete cascade,
  budget_month date not null check (extract(day from budget_month) = 1),
  member_user_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (household_id, budget_month, member_user_id),
  foreign key (household_id, member_user_id) references public.household_members(household_id, user_id) on delete cascade
);

alter table public.personal_budgets enable row level security;

drop policy if exists "members view personal budgets" on public.personal_budgets;
drop policy if exists "members add personal budgets" on public.personal_budgets;
drop policy if exists "members update personal budgets" on public.personal_budgets;
create policy "members view personal budgets" on public.personal_budgets for select using (public.is_household_member(household_id));
create policy "members add personal budgets" on public.personal_budgets for insert with check (public.is_household_member(household_id));
create policy "members update personal budgets" on public.personal_budgets for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
