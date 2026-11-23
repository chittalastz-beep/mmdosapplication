begin;

alter table public.society_members
  add column if not exists last_login_at timestamptz,
  add column if not exists last_login_platform text
    check (last_login_platform is null or last_login_platform in ('windows', 'android', 'ios', 'other'));

create table if not exists public.society_login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('windows', 'android', 'ios', 'other')),
  signed_in_at timestamptz not null default now()
);

create index if not exists society_login_events_user_time_idx
  on public.society_login_events (user_id, signed_in_at desc);

alter table public.society_login_events enable row level security;
drop policy if exists society_login_events_select_self on public.society_login_events;
create policy society_login_events_select_self on public.society_login_events
for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_member()));

create or replace function public.record_society_login(client_platform text)
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

revoke all on table public.society_members from public, anon, authenticated;
grant select (id, user_id, full_name, unit_name, email, phone, role, status, created_at, updated_at)
  on table public.society_members to authenticated;
revoke all on table public.society_login_events from public, anon, authenticated;
grant select on table public.society_login_events to authenticated;
revoke all on function public.record_society_login(text) from public, anon, authenticated;
grant execute on function public.record_society_login(text) to authenticated;

commit;
