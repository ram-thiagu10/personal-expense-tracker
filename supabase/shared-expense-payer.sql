-- Add payer tracking for shared expenses in existing installations.
alter table public.expenses
  add column if not exists paid_by uuid references auth.users(id) on delete set null;

notify pgrst, 'reload schema';
