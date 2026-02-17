create type public.roles as enum ('admin', 'user');

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.roles not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_roles_set_updated_at
before update on public.user_roles
for each row
execute function public.set_updated_at();

insert into public.user_roles (user_id, role)
select
  u.id,
  case
    when row_number() over (order by u.created_at asc, u.id asc) = 1 then 'admin'::public.roles
    else 'user'::public.roles
  end as role
from auth.users u
on conflict (user_id)
do update set
  role = excluded.role,
  updated_at = now();

create or replace function public.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role = 'admin'
  );
$$;

alter table public.user_roles enable row level security;

create policy "user_roles_select_self_or_admin"
on public.user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

create policy "user_roles_insert_admin_only"
on public.user_roles
for insert
to authenticated
with check (public.is_admin(auth.uid()));

create policy "user_roles_update_admin_only"
on public.user_roles
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy "user_roles_delete_admin_only"
on public.user_roles
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "projects_select_owner_or_member" on public.projects;
create policy "projects_select_owner_member_or_admin"
on public.projects
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_project_member(id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "projects_insert_owner_only" on public.projects;
create policy "projects_insert_owner_or_admin"
on public.projects
for insert
to authenticated
with check (
  owner_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "projects_update_owner_only" on public.projects;
create policy "projects_update_owner_or_admin"
on public.projects
for update
to authenticated
using (
  owner_id = auth.uid()
  or public.is_admin(auth.uid())
)
with check (
  owner_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "projects_delete_owner_only" on public.projects;
create policy "projects_delete_owner_or_admin"
on public.projects
for delete
to authenticated
using (
  owner_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "project_members_select_accessible_projects" on public.project_members;
create policy "project_members_select_accessible_projects"
on public.project_members
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "project_members_insert_owner_only" on public.project_members;
create policy "project_members_insert_owner_or_admin"
on public.project_members
for insert
to authenticated
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "project_members_delete_owner_only" on public.project_members;
create policy "project_members_delete_owner_or_admin"
on public.project_members
for delete
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "project_stages_select_accessible_projects" on public.project_stages;
create policy "project_stages_select_accessible_projects"
on public.project_stages
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "project_stages_insert_accessible_projects" on public.project_stages;
create policy "project_stages_insert_accessible_projects"
on public.project_stages
for insert
to authenticated
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "project_stages_update_accessible_projects" on public.project_stages;
create policy "project_stages_update_accessible_projects"
on public.project_stages
for update
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
)
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "project_stages_delete_accessible_projects" on public.project_stages;
create policy "project_stages_delete_accessible_projects"
on public.project_stages
for delete
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "tasks_select_accessible_projects" on public.tasks;
create policy "tasks_select_accessible_projects"
on public.tasks
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "tasks_insert_accessible_projects" on public.tasks;
create policy "tasks_insert_accessible_projects"
on public.tasks
for insert
to authenticated
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "tasks_update_accessible_projects" on public.tasks;
create policy "tasks_update_accessible_projects"
on public.tasks
for update
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
)
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "tasks_delete_accessible_projects" on public.tasks;
create policy "tasks_delete_accessible_projects"
on public.tasks
for delete
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated_or_admin"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin(auth.uid())
);

create policy "profiles_update_admin_only"
on public.profiles
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  role public.roles,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Forbidden';
  end if;

  return query
  select
    u.id,
    coalesce(nullif(u.email, ''), p.email, '') as email,
    coalesce(ur.role, 'user'::public.roles) as role,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_roles ur on ur.user_id = u.id
  order by lower(coalesce(nullif(u.email, ''), p.email, '')) asc, u.created_at asc;
end;
$$;

create or replace function public.admin_update_user(
  p_user_id uuid,
  p_email text,
  p_role public.roles
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  v_email := trim(coalesce(p_email, ''));
  if v_email = '' then
    raise exception 'Email is required';
  end if;

  update auth.users
  set
    email = v_email,
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;

  insert into public.profiles (id, email)
  values (p_user_id, v_email)
  on conflict (id)
  do update set
    email = excluded.email,
    updated_at = now();

  insert into public.user_roles (user_id, role)
  values (p_user_id, coalesce(p_role, 'user'::public.roles))
  on conflict (user_id)
  do update set
    role = excluded.role,
    updated_at = now();
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Forbidden';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  delete from auth.users where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_update_user(uuid, text, public.roles) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
