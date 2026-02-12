drop policy if exists "projects_select_owner_or_member" on public.projects;
create policy "projects_select_owner_or_member"
on public.projects
for select
to authenticated
using (
  owner_id = auth.uid()
  or public.is_project_member(id, auth.uid())
);

drop policy if exists "project_members_select_accessible_projects" on public.project_members;
create policy "project_members_select_accessible_projects"
on public.project_members
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

drop policy if exists "project_members_insert_owner_only" on public.project_members;
create policy "project_members_insert_owner_only"
on public.project_members
for insert
to authenticated
with check (public.is_project_owner(project_id, auth.uid()));

drop policy if exists "project_members_delete_owner_only" on public.project_members;
create policy "project_members_delete_owner_only"
on public.project_members
for delete
to authenticated
using (public.is_project_owner(project_id, auth.uid()));

drop policy if exists "project_stages_select_accessible_projects" on public.project_stages;
create policy "project_stages_select_accessible_projects"
on public.project_stages
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

drop policy if exists "project_stages_insert_accessible_projects" on public.project_stages;
create policy "project_stages_insert_accessible_projects"
on public.project_stages
for insert
to authenticated
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

drop policy if exists "project_stages_update_accessible_projects" on public.project_stages;
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

drop policy if exists "project_stages_delete_accessible_projects" on public.project_stages;
create policy "project_stages_delete_accessible_projects"
on public.project_stages
for delete
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

drop policy if exists "tasks_select_accessible_projects" on public.tasks;
create policy "tasks_select_accessible_projects"
on public.tasks
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

drop policy if exists "tasks_insert_accessible_projects" on public.tasks;
create policy "tasks_insert_accessible_projects"
on public.tasks
for insert
to authenticated
with check (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);

drop policy if exists "tasks_update_accessible_projects" on public.tasks;
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

drop policy if exists "tasks_delete_accessible_projects" on public.tasks;
create policy "tasks_delete_accessible_projects"
on public.tasks
for delete
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
);
