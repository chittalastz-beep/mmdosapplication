begin;

create table public.maintenance_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.society_members (id) on delete restrict,
  member_name text not null check (length(trim(member_name)) between 1 and 120),
  unit_name text not null check (length(trim(unit_name)) between 1 and 20),
  billing_month date not null check (billing_month = date_trunc('month', billing_month)::date),
  amount numeric(14, 2) not null check (amount > 0),
  received_on date not null default current_date,
  reference text check (reference is null or length(trim(reference)) between 1 and 120),
  received_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index maintenance_payments_month_idx
  on public.maintenance_payments (billing_month desc, received_on desc);
create index maintenance_payments_member_idx
  on public.maintenance_payments (member_id, billing_month desc);

alter table public.maintenance_payments enable row level security;

create policy maintenance_payments_select_active_members on public.maintenance_payments
for select to authenticated
using ((select private.has_society_role(array['administrator', 'president', 'treasurer', 'secretary', 'member'])));

create policy maintenance_payments_insert_financial_staff on public.maintenance_payments
for insert to authenticated
with check (
  received_by = (select auth.uid())
  and (select private.has_society_role(array['administrator', 'treasurer']))
);

revoke all on table public.maintenance_payments from public, anon, authenticated;
grant select, insert on table public.maintenance_payments to authenticated;

commit;
