begin;

create or replace function private.is_google_authenticated()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      coalesce((select auth.jwt() -> 'app_metadata' -> 'providers') ? 'google', false)
      or (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    )
    and exists (
      select 1
      from auth.users as auth_user
      where auth_user.id = (select auth.uid())
        and auth_user.email_confirmed_at is not null
        and lower(auth_user.email) = lower((select auth.jwt() ->> 'email'))
    );
$$;

create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_google_authenticated()) and exists (
    select 1 from public.society_members as member
    where member.user_id = (select auth.uid()) and member.status = 'active'
  );
$$;

create or replace function private.has_society_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_google_authenticated()) and exists (
    select 1 from public.society_members as member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.role = any (allowed_roles)
  );
$$;

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
  confirmed_email text;
begin
  if not private.has_society_role(array['president', 'secretary']) then
    raise exception 'Only the President or Secretary can add a member';
  end if;
  if member_email is null or trim(member_email) = '' then
    raise exception 'Enter the member email used by their verified Google account';
  end if;
  if nullif(trim(member_phone), '') is not null
    and trim(member_phone) !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Enter the member phone in international format, for example +919876543210';
  end if;

  select auth_user.id, lower(auth_user.email)
    into linked_user_id, confirmed_email
  from auth.users as auth_user
  where lower(auth_user.email) = lower(trim(member_email))
    and auth_user.email_confirmed_at is not null;
  if linked_user_id is null then
    raise exception 'Create and verify the member email account in Supabase Auth before adding the profile';
  end if;

  insert into public.society_members (user_id, full_name, unit_name, email, phone, role, status)
  values (
    linked_user_id, trim(member_name), upper(trim(member_unit)),
    confirmed_email, nullif(trim(member_phone), ''), 'member', 'pending'
  )
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
      and (select private.has_society_role(array['president', 'treasurer', 'secretary', 'member']))
    )
    or (
      status = 'pending'
      and (select private.has_society_role(array['president', 'secretary']))
    )
  )
);

revoke all on function private.is_google_authenticated() from public, anon, authenticated;
grant execute on function private.is_google_authenticated() to authenticated;
revoke all on function public.add_society_member(text, text, text, text) from public, anon, authenticated;
grant execute on function public.add_society_member(text, text, text, text) to authenticated;

commit;
