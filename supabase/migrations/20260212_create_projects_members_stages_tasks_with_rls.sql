create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_owner_id_idx on public.projects(owner_id);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(project_id, user_id)
);

create index project_members_user_id_idx on public.project_members(user_id);
create index project_members_project_id_idx on public.project_members(project_id);

create table public.project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  order_position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, order_position),
  unique(id, project_id)
);

create index project_stages_project_order_idx on public.project_stages(project_id, order_position);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage_id uuid not null,
  title text not null check (char_length(trim(title)) > 0),
  description_html text not null default '',
  order_position integer not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(stage_id, order_position),
  constraint tasks_stage_project_fk
    foreign key (stage_id, project_id)
    references public.project_stages(id, project_id)
    on delete cascade
);

create index tasks_project_id_idx on public.tasks(project_id);
create index tasks_stage_order_idx on public.tasks(stage_id, order_position);
create index tasks_done_idx on public.tasks(done);

create trigger projects_set_updated_at
before update on public.projects
for each row
execute function public.set_updated_at();

create trigger project_stages_set_updated_at
before update on public.project_stages
for each row
execute function public.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

create or replace function public.is_project_owner(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and p.owner_id = p_user_id
  );
$$;

create or replace function public.is_project_member(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p_user_id
  );
$$;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_stages enable row level security;
alter table public.tasks enable row level security;

create policy "projects_select_owner_or_member"
on public.projects
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_project_member(id, auth.uid())
);

create policy "projects_insert_owner_only"
on public.projects
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "projects_update_owner_only"
on public.projects
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "projects_delete_owner_only"
on public.projects
for delete
to authenticated
using (owner_id = auth.uid());

create policy "project_members_select_accessible_projects"
on public.project_members
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

create policy "project_members_insert_owner_only"
on public.project_members
for insert
to authenticated
with check (public.is_project_owner(project_id, auth.uid()));

create policy "project_members_delete_owner_or_self"
on public.project_members
for delete
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or user_id = auth.uid()
);

create policy "project_stages_select_accessible_projects"
on public.project_stages
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

create policy "project_stages_insert_accessible_projects"
on public.project_stages
for insert
to authenticated
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

create policy "project_stages_update_accessible_projects"
on public.project_stages
for update
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
)
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

create policy "project_stages_delete_accessible_projects"
on public.project_stages
for delete
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

create policy "tasks_select_accessible_projects"
on public.tasks
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

create policy "tasks_insert_accessible_projects"
on public.tasks
for insert
to authenticated
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

create policy "tasks_update_accessible_projects"
on public.tasks
for update
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
)
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

create policy "tasks_delete_accessible_projects"
on public.tasks
for delete
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);
