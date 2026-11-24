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
  current_phone text;
begin
  select member.phone into current_phone
  from public.society_members as member
  where member.id = target_member_id;

  return public.update_society_member(
    target_member_id,
    member_name,
    member_unit,
    member_email,
    current_phone,
    assigned_role
  );
end;
$$;

revoke all on function public.update_society_member(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_society_member(uuid, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
