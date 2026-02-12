create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles(email);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id)
  do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile_sync on auth.users;
create trigger on_auth_user_created_profile_sync
after insert or update on auth.users
for each row
execute function public.sync_profile_from_auth_user();

insert into public.profiles (id, email)
select u.id, coalesce(u.email, '')
from auth.users u
on conflict (id)
do update set
  email = excluded.email,
  updated_at = now();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "project_members_delete_owner_or_self" on public.project_members;
drop policy if exists "project_members_delete_owner_only" on public.project_members;
create policy "project_members_delete_owner_only"
on public.project_members
for delete
to authenticated
using (public.is_project_owner(project_id, auth.uid()));
