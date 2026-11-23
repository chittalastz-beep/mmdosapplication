begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.society_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  unit_name text not null unique check (length(trim(unit_name)) between 1 and 20),
  email text unique,
  phone text check (phone is null or length(phone) between 7 and 32),
  role text not null default 'member' check (role in ('president', 'treasurer', 'secretary', 'security', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  last_login_at timestamptz,
  last_login_platform text check (last_login_platform is null or last_login_platform in ('windows', 'android', 'ios', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 140),
  category text not null check (length(trim(category)) between 1 and 60),
  vendor text not null check (length(trim(vendor)) between 1 and 120),
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  receipt_path text,
  status text not null default 'submitted'
    check (status in ('submitted', 'treasurer_approved', 'approved', 'paid', 'rejected')),
  submitted_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  treasurer_approved_by uuid references auth.users (id) on delete restrict,
  president_approved_by uuid references auth.users (id) on delete restrict,
  paid_by uuid references auth.users (id) on delete restrict,
  paid_at timestamptz,
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'submitted' and treasurer_approved_by is null and president_approved_by is null and paid_by is null and paid_at is null)
    or (status = 'treasurer_approved' and treasurer_approved_by is not null and president_approved_by is null and paid_by is null and paid_at is null)
    or (status = 'approved' and treasurer_approved_by is not null and president_approved_by is not null and paid_by is null and paid_at is null)
    or (status = 'paid' and treasurer_approved_by is not null and president_approved_by is not null and paid_by is not null and paid_at is not null)
    or (status = 'rejected')
  )
);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 140),
  location text not null check (length(trim(location)) between 1 and 80),
  priority text not null default 'Normal' check (priority in ('Normal', 'High', 'Urgent')),
  status text not null default 'Open' check (status in ('Open', 'In progress', 'Resolved')),
  reported_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.security_visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_name text not null check (length(trim(visitor_name)) between 1 and 100),
  purpose text not null check (length(trim(purpose)) between 1 and 100),
  visiting_unit text not null check (length(trim(visiting_unit)) between 1 and 20),
  entry_at timestamptz not null default now(),
  checked_out_at timestamptz,
  logged_by uuid not null default auth.uid() references auth.users (id) on delete restrict
);

create table public.community_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 3000),
  audience text not null default 'All members' check (length(trim(audience)) between 1 and 80),
  published_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.society_audit_events (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null,
  actor_id uuid references auth.users (id) on delete set null,
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now()
);

create table public.society_login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('windows', 'android', 'ios', 'other')),
  signed_in_at timestamptz not null default now()
);

create index expenses_status_date_idx on public.expenses (status, expense_date desc);
create index maintenance_status_priority_idx on public.maintenance_requests (status, priority, created_at desc);
create index visitors_entry_idx on public.security_visitors (entry_at desc);
create index notices_created_idx on public.community_notices (created_at desc);
create index audit_record_idx on public.society_audit_events (table_name, record_id, occurred_at);
create index society_login_events_user_time_idx on public.society_login_events (user_id, signed_in_at desc);

create function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.society_members as member
    where member.user_id = (select auth.uid()) and member.status = 'active'
  );
$$;

create function private.has_society_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.society_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role = any (allowed_roles)
  );
$$;

create function public.record_society_login(client_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.is_active_member() then
    raise exception 'An active society member must be signed in to record login activity';
  end if;
  if client_platform not in ('windows', 'android', 'ios', 'other') then
    raise exception 'Unsupported device platform';
  end if;

  update public.society_members
  set last_login_at = now(), last_login_platform = client_platform
  where user_id = actor and status = 'active';
  if not found then
    raise exception 'Active society membership was not found';
  end if;

  insert into public.society_login_events (user_id, platform)
  values (actor, client_platform);
end;
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger society_members_set_updated_at
before update on public.society_members
for each row execute function private.set_updated_at();

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function private.set_updated_at();

create trigger maintenance_requests_set_updated_at
before update on public.maintenance_requests
for each row execute function private.set_updated_at();

create function private.audit_expense_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.society_audit_events (
    table_name, record_id, action, actor_id, old_data, new_data
  ) values (
    'expenses', new.id, coalesce(new.status, 'created'), (select auth.uid()),
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger expenses_audit_after_write
after insert or update on public.expenses
for each row execute function private.audit_expense_change();

create function public.review_expense(
  target_expense_id uuid,
  decision text,
  reason text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_row public.expenses%rowtype;
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'Sign in to review society expenses';
  end if;

  select * into expense_row
  from public.expenses
  where id = target_expense_id
  for update;
  if not found then
    raise exception 'Expense was not found';
  end if;

  if decision = 'treasurer_approve' then
    if expense_row.status <> 'submitted'
      or not private.has_society_role(array['treasurer']) then
      raise exception 'Only the Treasurer can approve a submitted expense at this stage';
    end if;
    update public.expenses
    set status = 'treasurer_approved', treasurer_approved_by = actor, rejection_reason = null
    where id = target_expense_id returning * into expense_row;
  elsif decision = 'president_approve' then
    if expense_row.status <> 'treasurer_approved'
      or not private.has_society_role(array['president'])
      or expense_row.treasurer_approved_by = actor then
      raise exception 'A different President must approve after Treasurer review';
    end if;
    update public.expenses
    set status = 'approved', president_approved_by = actor
    where id = target_expense_id returning * into expense_row;
  elsif decision = 'mark_paid' then
    if expense_row.status <> 'approved'
      or not private.has_society_role(array['treasurer', 'president']) then
      raise exception 'Only the Treasurer or President can record payment after approval';
    end if;
    update public.expenses
    set status = 'paid', paid_by = actor, paid_at = now()
    where id = target_expense_id returning * into expense_row;
  elsif decision = 'return' then
    if expense_row.status not in ('submitted', 'treasurer_approved')
      or not private.has_society_role(array['treasurer', 'president']) then
      raise exception 'Only the Treasurer or President can return an expense before final approval';
    end if;
    if length(trim(coalesce(reason, ''))) = 0 then
      raise exception 'Provide a reason when returning an expense';
    end if;
    update public.expenses
    set status = 'rejected', rejection_reason = trim(reason)
    where id = target_expense_id returning * into expense_row;
  else
    raise exception 'Unknown expense decision';
  end if;

  return expense_row;
end;
$$;

create function public.set_maintenance_status(target_request_id uuid, next_status text)
returns public.maintenance_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.maintenance_requests%rowtype;
begin
  if not private.has_society_role(array['president', 'secretary', 'security']) then
    raise exception 'Only authorized committee or security members can update maintenance status';
  end if;
  if next_status not in ('In progress', 'Resolved') then
    raise exception 'Invalid maintenance status';
  end if;
  update public.maintenance_requests
  set status = next_status
  where id = target_request_id and status <> 'Resolved'
  returning * into request_row;
  if not found then
    raise exception 'Open maintenance request was not found';
  end if;
  return request_row;
end;
$$;

create function public.add_society_member(
  member_name text,
  member_unit text,
  member_email text,
  member_phone text
)
returns public.society_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row public.society_members%rowtype;
  linked_user_id uuid;
begin
  if not private.has_society_role(array['president', 'secretary']) then
    raise exception 'Only the President or Secretary can add a member';
  end if;
  select auth_user.id into linked_user_id
  from auth.users as auth_user
  where lower(auth_user.email) = lower(trim(member_email));
  insert into public.society_members (full_name, unit_name, email, phone, role, status)
  values (
    trim(member_name), upper(trim(member_unit)), nullif(lower(trim(member_email)), ''),
    nullif(trim(member_phone), ''), 'member', 'pending'
  )
  returning * into member_row;
  if linked_user_id is not null then
    update public.society_members
    set user_id = linked_user_id
    where id = member_row.id
    returning * into member_row;
  end if;
  return member_row;
end;
$$;

create function public.checkout_visitor(target_visitor_id uuid)
returns public.security_visitors
language plpgsql
security definer
set search_path = ''
as $$
declare
  visitor_row public.security_visitors%rowtype;
begin
  if not private.has_society_role(array['security']) then
    raise exception 'Only security staff can check out a visitor';
  end if;
  update public.security_visitors
  set checked_out_at = now()
  where id = target_visitor_id and checked_out_at is null
  returning * into visitor_row;
  if not found then
    raise exception 'Active visitor entry was not found';
  end if;
  return visitor_row;
end;
$$;

create function public.review_society_member(
  target_member_id uuid,
  approve boolean,
  assigned_role text default 'member'
)
returns public.society_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row public.society_members%rowtype;
begin
  if not private.has_society_role(array['president', 'secretary']) then
    raise exception 'Only the President or Secretary can review member access';
  end if;
  if assigned_role not in ('president', 'treasurer', 'secretary', 'security', 'member') then
    raise exception 'Invalid society role';
  end if;
  select * into member_row
  from public.society_members
  where id = target_member_id
  for update;
  if not found or member_row.status <> 'pending' then
    raise exception 'Pending member application was not found';
  end if;
  if approve and member_row.user_id is null then
    raise exception 'Create the member login in Supabase Auth before approving access';
  end if;
  update public.society_members
  set status = case when approve then 'active' else 'suspended' end,
      role = case when approve then assigned_role else role end
  where id = target_member_id
  returning * into member_row;
  return member_row;
end;
$$;

alter table public.society_members enable row level security;
alter table public.expenses enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.security_visitors enable row level security;
alter table public.community_notices enable row level security;
alter table public.society_audit_events enable row level security;
alter table public.society_login_events enable row level security;

create policy society_members_select_member_or_self on public.society_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    status = 'active' and (select private.is_active_member())
  )
  or (
    status = 'pending'
    and (select private.has_society_role(array['president', 'secretary']))
  )
);

create policy expenses_select_active_members on public.expenses
for select to authenticated
using ((select private.is_active_member()));

create policy expenses_insert_active_members on public.expenses
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'submitted'
  and treasurer_approved_by is null and president_approved_by is null
  and paid_by is null and paid_at is null
  and (select private.is_active_member())
);

create policy maintenance_select_active_members on public.maintenance_requests
for select to authenticated
using ((select private.is_active_member()));

create policy maintenance_insert_active_members on public.maintenance_requests
for insert to authenticated
with check (
  reported_by = (select auth.uid())
  and status = 'Open'
  and (select private.is_active_member())
);

create policy visitors_select_security_committee on public.security_visitors
for select to authenticated
using ((select private.has_society_role(array['president', 'secretary', 'security'])));

create policy visitors_insert_security on public.security_visitors
for insert to authenticated
with check (
  logged_by = (select auth.uid())
  and (select private.has_society_role(array['security']))
);

create policy notices_select_active_members on public.community_notices
for select to authenticated
using ((select private.is_active_member()));

create policy notices_insert_committee on public.community_notices
for insert to authenticated
with check (
  published_by = (select auth.uid())
  and (select private.has_society_role(array['president', 'secretary', 'treasurer']))
);

create policy audit_select_active_members on public.society_audit_events
for select to authenticated
using ((select private.is_active_member()));

create policy society_login_events_select_self on public.society_login_events
for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_member()));

revoke all on table public.society_members, public.expenses, public.maintenance_requests,
  public.security_visitors, public.community_notices, public.society_audit_events, public.society_login_events
  from public, anon, authenticated;
grant select (id, user_id, full_name, unit_name, email, phone, role, status, created_at, updated_at)
  on table public.society_members to authenticated;
grant select on table public.expenses, public.maintenance_requests,
  public.community_notices, public.society_audit_events, public.society_login_events to authenticated;
grant insert on table public.expenses, public.maintenance_requests, public.community_notices to authenticated;
grant insert (visitor_name, purpose, visiting_unit, logged_by)
  on table public.security_visitors to authenticated;

revoke all on function private.is_active_member() from public, anon, authenticated;
revoke all on function private.has_society_role(text[]) from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.audit_expense_change() from public, anon, authenticated;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.has_society_role(text[]) to authenticated;
revoke all on function public.review_expense(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_maintenance_status(uuid, text) from public, anon, authenticated;
revoke all on function public.add_society_member(text, text, text, text) from public, anon, authenticated;
revoke all on function public.checkout_visitor(uuid) from public, anon, authenticated;
revoke all on function public.review_society_member(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.record_society_login(text) from public, anon, authenticated;
grant execute on function public.review_expense(uuid, text, text) to authenticated;
grant execute on function public.set_maintenance_status(uuid, text) to authenticated;
grant execute on function public.add_society_member(text, text, text, text) to authenticated;
grant execute on function public.checkout_visitor(uuid) to authenticated;
grant execute on function public.review_society_member(uuid, boolean, text) to authenticated;
grant execute on function public.record_society_login(text) to authenticated;

commit;
