begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-documents',
  'expense-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy expense_documents_select_active_members on storage.objects
for select to authenticated
using (
  bucket_id = 'expense-documents'
  and (select private.is_active_member())
  and exists (
    select 1 from public.expenses as expense
    where expense.id::text = (storage.foldername(name))[1]
      and expense.receipt_path = name
  )
);

create policy expense_documents_insert_treasurer on storage.objects
for insert to authenticated
with check (
  bucket_id = 'expense-documents'
  and (select private.has_society_role(array['treasurer']))
  and exists (
    select 1 from public.expenses as expense
    where expense.id::text = (storage.foldername(name))[1]
  )
);

create policy expense_documents_delete_treasurer on storage.objects
for delete to authenticated
using (
  bucket_id = 'expense-documents'
  and (select private.has_society_role(array['treasurer']))
  and exists (
    select 1 from public.expenses as expense
    where expense.id::text = (storage.foldername(name))[1]
  )
);

create function public.attach_expense_document(target_expense_id uuid, document_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_society_role(array['treasurer']) then
    raise exception 'Only the Treasurer can attach documents to expenses';
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

revoke all on function public.attach_expense_document(uuid, text) from public, anon, authenticated;
grant execute on function public.attach_expense_document(uuid, text) to authenticated;

commit;
