begin;

grant select, insert, update
  on table public.society_members
  to service_role;

commit;
