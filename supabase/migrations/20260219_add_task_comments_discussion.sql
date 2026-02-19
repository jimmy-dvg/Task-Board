create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_comments_task_id_created_at_idx
  on public.task_comments(task_id, created_at asc);
create index if not exists task_comments_created_by_idx
  on public.task_comments(created_by);

drop trigger if exists task_comments_set_updated_at on public.task_comments;
create trigger task_comments_set_updated_at
before update on public.task_comments
for each row
execute function public.set_updated_at();

alter table public.task_comments enable row level security;

drop policy if exists "task_comments_select_accessible_tasks" on public.task_comments;
create policy "task_comments_select_accessible_tasks"
on public.task_comments
for select
to authenticated
using (public.can_access_task(task_id, auth.uid()));

drop policy if exists "task_comments_insert_accessible_tasks" on public.task_comments;
create policy "task_comments_insert_accessible_tasks"
on public.task_comments
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_task(task_id, auth.uid())
);

drop policy if exists "task_comments_update_author_or_admin" on public.task_comments;
create policy "task_comments_update_author_or_admin"
on public.task_comments
for update
to authenticated
using (
  created_by = auth.uid()
  or public.is_admin(auth.uid())
)
with check (
  public.can_access_task(task_id, auth.uid())
  and (
    created_by = auth.uid()
    or public.is_admin(auth.uid())
  )
);

drop policy if exists "task_comments_delete_author_or_admin" on public.task_comments;
create policy "task_comments_delete_author_or_admin"
on public.task_comments
for delete
to authenticated
using (
  public.can_access_task(task_id, auth.uid())
  and (
    created_by = auth.uid()
    or public.is_admin(auth.uid())
  )
);