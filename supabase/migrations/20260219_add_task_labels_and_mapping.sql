create table if not exists public.project_labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists project_labels_project_name_unique_idx
  on public.project_labels(project_id, lower(trim(name)));
create index if not exists project_labels_project_id_idx
  on public.project_labels(project_id);

drop trigger if exists project_labels_set_updated_at on public.project_labels;
create trigger project_labels_set_updated_at
before update on public.project_labels
for each row
execute function public.set_updated_at();

create table if not exists public.task_labels (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.project_labels(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(task_id, label_id)
);

create index if not exists task_labels_task_id_idx on public.task_labels(task_id);
create index if not exists task_labels_label_id_idx on public.task_labels(label_id);

alter table public.project_labels enable row level security;
alter table public.task_labels enable row level security;

drop policy if exists "project_labels_select_accessible_projects" on public.project_labels;
create policy "project_labels_select_accessible_projects"
on public.project_labels
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "project_labels_insert_accessible_projects" on public.project_labels;
create policy "project_labels_insert_accessible_projects"
on public.project_labels
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.is_project_owner(project_id, auth.uid())
    or public.is_project_member(project_id, auth.uid())
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "project_labels_update_accessible_projects" on public.project_labels;
create policy "project_labels_update_accessible_projects"
on public.project_labels
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

drop policy if exists "project_labels_delete_accessible_projects" on public.project_labels;
create policy "project_labels_delete_accessible_projects"
on public.project_labels
for delete
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "task_labels_select_accessible_tasks" on public.task_labels;
create policy "task_labels_select_accessible_tasks"
on public.task_labels
for select
to authenticated
using (public.can_access_task(task_id, auth.uid()));

drop policy if exists "task_labels_insert_accessible_tasks" on public.task_labels;
create policy "task_labels_insert_accessible_tasks"
on public.task_labels
for insert
to authenticated
with check (public.can_access_task(task_id, auth.uid()));

drop policy if exists "task_labels_delete_accessible_tasks" on public.task_labels;
create policy "task_labels_delete_accessible_tasks"
on public.task_labels
for delete
to authenticated
using (public.can_access_task(task_id, auth.uid()));