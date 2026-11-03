-- Homeflow database and security setup. Run once in Supabase: SQL Editor → New query.
create extension if not exists pgcrypto;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table public.categories (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  color text not null default '#5B6CFF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table public.expenses (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  category_id bigint not null references public.categories(id) on delete restrict,
  expense_date date not null,
  ownership text not null check (ownership in ('common', 'personal')),
  person text,
  paid_by uuid references auth.users(id) on delete set null,
  note text not null default '' check (char_length(note) <= 160),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((ownership = 'common' and person is null) or (ownership = 'personal' and person is not null))
);

create index expenses_household_date_idx on public.expenses (household_id, expense_date desc);
create index categories_household_idx on public.categories (household_id);

-- These helpers avoid policy recursion and run only with the caller's authenticated ID.
create or replace function public.is_household_member(target_household uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.household_members where household_id = target_household and user_id = auth.uid());
$$;

create or replace function public.create_household(household_name text, member_name text)
returns table (household_id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare new_household public.households;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then raise exception 'You already belong to a household'; end if;
  insert into public.households (name, created_by) values (trim(household_name), auth.uid()) returning * into new_household;
  insert into public.household_members (household_id, user_id, display_name) values (new_household.id, auth.uid(), trim(member_name));
  insert into public.categories (household_id, name, color) values
    (new_household.id,'Groceries','#6d5dfc'),(new_household.id,'Dining','#fb7185'),(new_household.id,'Home','#f59e0b'),
    (new_household.id,'Travel','#14b8a6'),(new_household.id,'Utilities','#3b82f6'),(new_household.id,'Health','#22c55e'),
    (new_household.id,'Shopping','#a855f7'),(new_household.id,'Other','#64748b');
  return query select new_household.id, new_household.invite_code;
end; $$;

create or replace function public.join_household(code text, member_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then raise exception 'You already belong to a household'; end if;
  select id into target_id from public.households where invite_code = lower(trim(code));
  if target_id is null then raise exception 'That invite code was not found'; end if;
  insert into public.household_members (household_id, user_id, display_name) values (target_id, auth.uid(), trim(member_name));
  return target_id;
end; $$;

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

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;

create policy "members view their household" on public.households for select using (public.is_household_member(id));
create policy "members view household roster" on public.household_members for select using (public.is_household_member(household_id));
create policy "members view categories" on public.categories for select using (public.is_household_member(household_id));
create policy "members add categories" on public.categories for insert with check (public.is_household_member(household_id));
create policy "members change categories" on public.categories for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members remove categories" on public.categories for delete using (public.is_household_member(household_id));
create policy "members view expenses" on public.expenses for select using (public.is_household_member(household_id));
create policy "members add expenses" on public.expenses for insert with check (public.is_household_member(household_id));
create policy "members change expenses" on public.expenses for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members remove expenses" on public.expenses for delete using (public.is_household_member(household_id));

-- Required for the app to call the setup functions.
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.current_household() to authenticated;
revoke execute on function public.create_household(text, text) from public;
revoke execute on function public.join_household(text, text) from public;
revoke execute on function public.is_household_member(uuid) from public;
revoke execute on function public.current_household() from public;
