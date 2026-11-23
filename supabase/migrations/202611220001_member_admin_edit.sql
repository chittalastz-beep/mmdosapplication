begin;

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
  if actor is null or not private.has_society_role(array['president', 'secretary']) then
    raise exception 'Only the President or Secretary can edit member profiles and roles';
  end if;
  if length(trim(coalesce(member_name, ''))) not between 1 and 120 then
    raise exception 'Member name must contain between 1 and 120 characters';
  end if;
  if length(trim(coalesce(member_unit, ''))) not between 1 and 20 then
    raise exception 'Unit must contain between 1 and 20 characters';
  end if;
  if assigned_role is null or assigned_role not in ('president', 'treasurer', 'secretary', 'security', 'member') then
    raise exception 'Invalid society role';
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

revoke all on function public.update_society_member(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_society_member(uuid, text, text, text, text) to authenticated;

commit;
