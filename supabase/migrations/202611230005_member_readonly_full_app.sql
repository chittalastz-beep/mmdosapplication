begin;

drop policy if exists expenses_insert_active_members on public.expenses;
create policy expenses_insert_active_members on public.expenses
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'submitted'
  and treasurer_approved_by is null and president_approved_by is null
  and paid_by is null and paid_at is null
  and (select private.has_society_role(array['president', 'treasurer', 'secretary']))
);

drop policy if exists maintenance_insert_active_members on public.maintenance_requests;
create policy maintenance_insert_active_members on public.maintenance_requests
for insert to authenticated
with check (
  reported_by = (select auth.uid())
  and status = 'Open'
  and (select private.has_society_role(array['president', 'treasurer', 'secretary']))
);

drop policy if exists visitors_select_security_committee on public.security_visitors;
create policy visitors_select_security_committee on public.security_visitors
for select to authenticated
using ((select private.has_society_role(array['president', 'secretary', 'security', 'member'])));

create or replace function public.update_my_society_profile(member_name text, member_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.has_society_role(array['president', 'treasurer', 'secretary']) then
    raise exception 'Only committee members can update their profile';
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

commit;
