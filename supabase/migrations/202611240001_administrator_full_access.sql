begin;

drop policy if exists society_members_select_member_or_self on public.society_members;
create policy society_members_select_member_or_self on public.society_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or (
    status = 'active'
    and (select private.has_society_role(array['administrator', 'president', 'treasurer', 'secretary', 'member']))
  )
  or (
    status = 'pending'
    and (select private.has_society_role(array['administrator', 'president', 'secretary']))
  )
  or (
    status = 'suspended'
    and (select private.has_society_role(array['administrator']))
  )
);

drop policy if exists expenses_select_active_members on public.expenses;
create policy expenses_select_active_members on public.expenses
for select to authenticated
using ((select private.has_society_role(array['administrator', 'president', 'treasurer', 'secretary', 'member'])));

drop policy if exists expenses_insert_active_members on public.expenses;
create policy expenses_insert_active_members on public.expenses
for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and status = 'submitted'
  and treasurer_approved_by is null and president_approved_by is null
  and paid_by is null and paid_at is null
  and (select private.has_society_role(array['administrator', 'president', 'treasurer', 'secretary']))
);

drop policy if exists maintenance_select_active_members on public.maintenance_requests;
create policy maintenance_select_active_members on public.maintenance_requests
for select to authenticated
using ((select private.has_society_role(array['administrator', 'president', 'treasurer', 'secretary', 'member'])));

drop policy if exists maintenance_insert_active_members on public.maintenance_requests;
create policy maintenance_insert_active_members on public.maintenance_requests
for insert to authenticated
with check (
  reported_by = (select auth.uid())
  and status = 'Open'
  and (select private.has_society_role(array['administrator', 'president', 'treasurer', 'secretary']))
);

drop policy if exists visitors_select_security_committee on public.security_visitors;
create policy visitors_select_security_committee on public.security_visitors
for select to authenticated
using ((select private.has_society_role(array['administrator', 'president', 'secretary', 'security', 'member'])));

drop policy if exists visitors_insert_security on public.security_visitors;
create policy visitors_insert_security on public.security_visitors
for insert to authenticated
with check (
  logged_by = (select auth.uid())
  and (select private.has_society_role(array['administrator', 'security']))
);

drop policy if exists notices_select_active_members on public.community_notices;
create policy notices_select_active_members on public.community_notices
for select to authenticated
using ((select private.has_society_role(array['administrator', 'president', 'treasurer', 'secretary', 'member'])));

drop policy if exists notices_insert_committee on public.community_notices;
create policy notices_insert_committee on public.community_notices
for insert to authenticated
with check (
  published_by = (select auth.uid())
  and (select private.has_society_role(array['administrator', 'president', 'secretary', 'treasurer']))
);

drop policy if exists audit_select_active_members on public.society_audit_events;
create policy audit_select_active_members on public.society_audit_events
for select to authenticated
using ((select private.has_society_role(array['administrator', 'president', 'treasurer', 'secretary', 'member'])));

drop policy if exists society_login_events_select_self on public.society_login_events;
create policy society_login_events_select_self on public.society_login_events
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_society_role(array['administrator']))
);

create or replace function public.review_expense(
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
  is_administrator boolean := private.has_society_role(array['administrator']);
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
      or (not is_administrator and not private.has_society_role(array['treasurer'])) then
      raise exception 'Only the Treasurer or Administrator can approve a submitted expense at this stage';
    end if;
    update public.expenses
    set status = 'treasurer_approved', treasurer_approved_by = actor, rejection_reason = null
    where id = target_expense_id returning * into expense_row;
  elsif decision = 'president_approve' then
    if expense_row.status <> 'treasurer_approved'
      or (not is_administrator and (
        not private.has_society_role(array['president'])
        or expense_row.treasurer_approved_by = actor
      )) then
      raise exception 'Only the President or Administrator can approve after Treasurer review';
    end if;
    update public.expenses
    set status = 'approved', president_approved_by = actor
    where id = target_expense_id returning * into expense_row;
  elsif decision = 'mark_paid' then
    if expense_row.status <> 'approved'
      or (not is_administrator and not private.has_society_role(array['treasurer', 'president'])) then
      raise exception 'Only the Treasurer, President, or Administrator can record payment after approval';
    end if;
    update public.expenses
    set status = 'paid', paid_by = actor, paid_at = now()
    where id = target_expense_id returning * into expense_row;
  elsif decision = 'return' then
    if expense_row.status not in ('submitted', 'treasurer_approved')
      or (not is_administrator and not private.has_society_role(array['treasurer', 'president'])) then
      raise exception 'Only the Treasurer, President, or Administrator can return an expense before final approval';
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

create or replace function public.set_maintenance_status(target_request_id uuid, next_status text)
returns public.maintenance_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.maintenance_requests%rowtype;
begin
  if not private.has_society_role(array['administrator', 'president', 'secretary', 'security']) then
    raise exception 'Only authorized committee, Administrator, or security members can update maintenance status';
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

create or replace function public.checkout_visitor(target_visitor_id uuid)
returns public.security_visitors
language plpgsql
security definer
set search_path = ''
as $$
declare
  visitor_row public.security_visitors%rowtype;
begin
  if not private.has_society_role(array['administrator', 'security']) then
    raise exception 'Only Security or an Administrator can check out a visitor';
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
  if not private.has_society_role(array['administrator', 'president', 'secretary']) then
    raise exception 'Only an Administrator, President, or Secretary can add a member';
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

create or replace function public.update_my_society_profile(member_name text, member_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not private.has_society_role(array['administrator', 'president', 'treasurer', 'secretary']) then
    raise exception 'Only committee members or an Administrator can update this profile';
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

drop function if exists public.update_society_member(uuid, text, text, text, text);
create function public.update_society_member(
  target_member_id uuid,
  member_name text,
  member_unit text,
  member_email text,
  member_phone text,
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
  is_administrator boolean := private.has_society_role(array['administrator']);
begin
  if actor is null or not private.has_society_role(array['administrator', 'president', 'secretary']) then
    raise exception 'Only an Administrator, President, or Secretary can edit member profiles and roles';
  end if;
  if length(trim(coalesce(member_name, ''))) not between 1 and 120 then
    raise exception 'Member name must contain between 1 and 120 characters';
  end if;
  if length(trim(coalesce(member_unit, ''))) not between 1 and 20 then
    raise exception 'Unit must contain between 1 and 20 characters';
  end if;
  if member_phone is not null and length(trim(member_phone)) not between 7 and 32 then
    raise exception 'Mobile number must contain between 7 and 32 characters';
  end if;
  if assigned_role is null or assigned_role not in ('administrator', 'president', 'treasurer', 'secretary', 'security', 'member') then
    raise exception 'Invalid society role';
  end if;
  if assigned_role = 'administrator' and not is_administrator then
    raise exception 'Only an Administrator can assign the Administrator role';
  end if;

  select * into member_row
  from public.society_members
  where id = target_member_id
  for update;
  if not found or (
    member_row.status not in ('pending', 'active')
    and not is_administrator
  ) then
    raise exception 'Editable society member was not found';
  end if;
  if member_row.user_id = actor and not is_administrator then
    raise exception 'Use your own profile settings to edit your profile';
  end if;
  if member_row.user_id = actor and assigned_role <> member_row.role then
    raise exception 'An Administrator cannot change their own role';
  end if;

  update public.society_members
  set full_name = trim(member_name),
      unit_name = upper(trim(member_unit)),
      email = nullif(lower(trim(member_email)), ''),
      phone = nullif(trim(member_phone), ''),
      role = assigned_role
  where id = target_member_id
  returning * into member_row;
  return member_row;
end;
$$;

drop policy if exists expense_documents_insert_treasurer on storage.objects;
create policy expense_documents_insert_treasurer on storage.objects
for insert to authenticated
with check (
  bucket_id = 'expense-documents'
  and (select private.has_society_role(array['administrator', 'treasurer']))
  and exists (
    select 1 from public.expenses as expense
    where expense.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists expense_documents_delete_treasurer on storage.objects;
create policy expense_documents_delete_treasurer on storage.objects
for delete to authenticated
using (
  bucket_id = 'expense-documents'
  and (select private.has_society_role(array['administrator', 'treasurer']))
  and exists (
    select 1 from public.expenses as expense
    where expense.id::text = (storage.foldername(name))[1]
  )
);

create or replace function public.attach_expense_document(target_expense_id uuid, document_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_society_role(array['administrator', 'treasurer']) then
    raise exception 'Only a Treasurer or Administrator can attach documents to expenses';
  end if;
  if document_path is null
    or (storage.foldername(document_path))[1] is distinct from target_expense_id::text
    or not exists (
      select 1 from storage.objects as stored_document
      where stored_document.bucket_id = 'expense-documents'
        and stored_document.name = document_path
    ) then
    raise exception 'The uploaded document does not belong to this expense';
  end if;

  update public.expenses
  set receipt_path = document_path
  where id = target_expense_id and receipt_path is null;
  if not found then
    raise exception 'Expense was not found or already has a document attached';
  end if;
end;
$$;

revoke all on function public.review_expense(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_maintenance_status(uuid, text) from public, anon, authenticated;
revoke all on function public.checkout_visitor(uuid) from public, anon, authenticated;
revoke all on function public.add_society_member(text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_my_society_profile(text, text) from public, anon, authenticated;
revoke all on function public.update_society_member(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.attach_expense_document(uuid, text) from public, anon, authenticated;
grant execute on function public.review_expense(uuid, text, text) to authenticated;
grant execute on function public.set_maintenance_status(uuid, text) to authenticated;
grant execute on function public.checkout_visitor(uuid) to authenticated;
grant execute on function public.add_society_member(text, text, text, text) to authenticated;
grant execute on function public.update_my_society_profile(text, text) to authenticated;
grant execute on function public.update_society_member(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.attach_expense_document(uuid, text) to authenticated;

commit;
