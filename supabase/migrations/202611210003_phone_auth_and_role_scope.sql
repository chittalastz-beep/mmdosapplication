begin;

create unique index if not exists society_members_phone_key
  on public.society_members (phone)
  where phone is not null;

create or replace function public.add_society_member(
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
  if member_phone is null or trim(member_phone) !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter the member phone in international format, for example +919876543210';
  end if;

  select auth_user.id into linked_user_id
  from auth.users as auth_user
  where auth_user.phone = trim(member_phone)
    and auth_user.phone_confirmed_at is not null;
  if linked_user_id is null then
    raise exception 'Create and verify the member phone account in Supabase Auth before adding the profile';
  end if;

  insert into public.society_members (user_id, full_name, unit_name, email, phone, role, status)
  values (
    linked_user_id, trim(member_name), upper(trim(member_unit)),
    nullif(lower(trim(member_email)), ''), trim(member_phone), 'member', 'pending'
  )
  returning * into member_row;
  return member_row;
end;
$$;

create or replace function public.update_my_society_profile(
  member_name text,
  member_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.has_society_role(array['president', 'treasurer', 'secretary', 'member']) then
    raise exception 'Only an active society member can update this profile';
  end if;
  if length(trim(coalesce(member_name, ''))) not between 1 and 120 then
    raise exception 'Name must contain between 1 and 120 characters';
  end if;

  update public.society_members
  set full_name = trim(member_name),
      email = nullif(lower(trim(member_email)), '')
  where user_id = actor and status = 'active';
  if not found then
    raise exception 'Active society membership was not found';
  end if;
end;
$$;

create or replace function public.set_maintenance_status(target_request_id uuid, next_status text)
returns public.maintenance_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.maintenance_requests%rowtype;
begin
  if not private.has_society_role(array['president', 'secretary']) then
    raise exception 'Only the President or Secretary can update maintenance status';
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

drop policy if exists society_members_select_member_or_self on public.society_members;
create policy society_members_select_member_or_self on public.society_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    status = 'active'
    and (select private.has_society_role(array['president', 'treasurer', 'secretary', 'member']))
  )
  or (
    status = 'pending'
    and (select private.has_society_role(array['president', 'secretary']))
  )
);

drop policy if exists expenses_select_active_members on public.expenses;
create policy expenses_select_active_members on public.expenses
for select to authenticated
using ((select private.has_society_role(array['president', 'treasurer', 'secretary', 'member'])));

drop policy if exists expenses_insert_active_members on public.expenses;
create policy expenses_insert_active_members on public.expenses
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'submitted'
  and treasurer_approved_by is null and president_approved_by is null
  and paid_by is null and paid_at is null
  and (select private.has_society_role(array['president', 'treasurer', 'secretary', 'member']))
);

drop policy if exists maintenance_select_active_members on public.maintenance_requests;
create policy maintenance_select_active_members on public.maintenance_requests
for select to authenticated
using ((select private.has_society_role(array['president', 'treasurer', 'secretary', 'member'])));

drop policy if exists maintenance_insert_active_members on public.maintenance_requests;
create policy maintenance_insert_active_members on public.maintenance_requests
for insert to authenticated
with check (
  reported_by = (select auth.uid())
  and status = 'Open'
  and (select private.has_society_role(array['president', 'treasurer', 'secretary', 'member']))
);

drop policy if exists notices_select_active_members on public.community_notices;
create policy notices_select_active_members on public.community_notices
for select to authenticated
using ((select private.has_society_role(array['president', 'treasurer', 'secretary', 'member'])));

drop policy if exists audit_select_active_members on public.society_audit_events;
create policy audit_select_active_members on public.society_audit_events
for select to authenticated
using ((select private.has_society_role(array['president', 'treasurer', 'secretary', 'member'])));

drop policy if exists society_login_events_select_self on public.society_login_events;
create policy society_login_events_select_self on public.society_login_events
for select to authenticated
using (
  user_id = (select auth.uid())
  and (select private.has_society_role(array['president', 'treasurer', 'secretary', 'member']))
);

revoke all on function public.add_society_member(text, text, text, text) from public, anon, authenticated;
grant execute on function public.add_society_member(text, text, text, text) to authenticated;
revoke all on function public.update_my_society_profile(text, text) from public, anon, authenticated;
grant execute on function public.update_my_society_profile(text, text) to authenticated;
revoke all on function public.set_maintenance_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_maintenance_status(uuid, text) to authenticated;

commit;
