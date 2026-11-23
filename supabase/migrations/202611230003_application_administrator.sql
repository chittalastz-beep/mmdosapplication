begin;

alter table public.society_members
  drop constraint if exists society_members_role_check;
alter table public.society_members
  add constraint society_members_role_check
  check (role in ('administrator', 'president', 'treasurer', 'secretary', 'security', 'member'));

create or replace function public.find_auth_user_for_provisioning(target_email text)
returns table (user_id uuid, email_confirmed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select auth_user.id, auth_user.email_confirmed_at is not null
  from auth.users as auth_user
  where lower(auth_user.email) = lower(trim(target_email))
  limit 1;
$$;

revoke all on function public.find_auth_user_for_provisioning(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_for_provisioning(text) to service_role;

create or replace function public.review_society_member(
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
  if not private.has_society_role(array['president', 'secretary', 'administrator']) then
    raise exception 'Only an authorized society administrator can review member access';
  end if;
  if assigned_role not in ('administrator', 'president', 'treasurer', 'secretary', 'security', 'member') then
    raise exception 'Invalid society role';
  end if;
  if assigned_role = 'administrator' and not private.has_society_role(array['administrator']) then
    raise exception 'Only an Administrator can assign the Administrator role';
  end if;

  select * into member_row
  from public.society_members
  where id = target_member_id
  for update;
  if not found or member_row.status <> 'pending' then
    raise exception 'Pending member application was not found';
  end if;
  if approve and member_row.user_id is null then
    raise exception 'Create the member Auth account before approving access';
  end if;
  update public.society_members
  set status = case when approve then 'active' else 'suspended' end,
      role = case when approve then assigned_role else role end
  where id = target_member_id
  returning * into member_row;
  return member_row;
end;
$$;

create or replace function public.update_society_member(
  target_member_id uuid,
  member_name text,
  member_unit text,
  member_email text,
  assigned_role text
)
returns public.society_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row public.society_members%rowtype;
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.has_society_role(array['president', 'secretary', 'administrator']) then
    raise exception 'Only an authorized society administrator can edit member profiles and roles';
  end if;
  if length(trim(coalesce(member_name, ''))) not between 1 and 120 then
    raise exception 'Member name must contain between 1 and 120 characters';
  end if;
  if length(trim(coalesce(member_unit, ''))) not between 1 and 20 then
    raise exception 'Unit must contain between 1 and 20 characters';
  end if;
  if assigned_role is null or assigned_role not in ('administrator', 'president', 'treasurer', 'secretary', 'security', 'member') then
    raise exception 'Invalid society role';
  end if;
  if assigned_role = 'administrator' and not private.has_society_role(array['administrator']) then
    raise exception 'Only an Administrator can assign the Administrator role';
  end if;

  select * into member_row
  from public.society_members
  where id = target_member_id
  for update;
  if not found or member_row.status not in ('pending', 'active') then
    raise exception 'Editable society member was not found';
  end if;
  if member_row.user_id = actor then
    raise exception 'Use your own profile settings to edit your profile';
  end if;

  update public.society_members
  set full_name = trim(member_name),
      unit_name = upper(trim(member_unit)),
      email = nullif(lower(trim(member_email)), ''),
      role = assigned_role
  where id = target_member_id
  returning * into member_row;
  return member_row;
end;
$$;

drop policy if exists society_members_select_member_or_self on public.society_members;
create policy society_members_select_member_or_self on public.society_members
for select to authenticated
using (
  (select private.is_google_authenticated())
  and (
    user_id = (select auth.uid())
    or (
      status = 'active'
      and (select private.has_society_role(array['president', 'treasurer', 'secretary', 'member', 'administrator']))
    )
    or (
      status = 'pending'
      and (select private.has_society_role(array['president', 'secretary', 'administrator']))
    )
  )
);

revoke all on function public.review_society_member(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_society_member(uuid, boolean, text) to authenticated;
revoke all on function public.update_society_member(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_society_member(uuid, text, text, text, text) to authenticated;

commit;
