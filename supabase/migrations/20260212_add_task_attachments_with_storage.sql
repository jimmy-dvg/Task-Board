create or replace function public.storage_task_id(p_object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_task_id_text text;
begin
  v_task_id_text := split_part(coalesce(p_object_name, ''), '/', 1);

  if v_task_id_text = '' then
    return null;
  end if;

  return v_task_id_text::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.can_access_task(p_task_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        public.is_project_owner(t.project_id, p_user_id)
        or public.is_project_member(t.project_id, p_user_id)
      )
  );
$$;

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  file_name text not null check (char_length(trim(file_name)) > 0),
  file_path text not null unique,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists task_attachments_task_id_idx on public.task_attachments(task_id);
create index if not exists task_attachments_created_by_idx on public.task_attachments(created_by);

alter table public.task_attachments enable row level security;

drop policy if exists "task_attachments_select_accessible_tasks" on public.task_attachments;
create policy "task_attachments_select_accessible_tasks"
on public.task_attachments
for select
to authenticated
using (public.can_access_task(task_id, auth.uid()));

drop policy if exists "task_attachments_insert_accessible_tasks" on public.task_attachments;
create policy "task_attachments_insert_accessible_tasks"
on public.task_attachments
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_task(task_id, auth.uid())
);

drop policy if exists "task_attachments_delete_accessible_tasks" on public.task_attachments;
create policy "task_attachments_delete_accessible_tasks"
on public.task_attachments
for delete
to authenticated
using (public.can_access_task(task_id, auth.uid()));

insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

drop policy if exists "task_attachments_storage_select" on storage.objects;
create policy "task_attachments_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'task-attachments'
  and public.can_access_task(public.storage_task_id(name), auth.uid())
);

drop policy if exists "task_attachments_storage_insert" on storage.objects;
create policy "task_attachments_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'task-attachments'
  and public.can_access_task(public.storage_task_id(name), auth.uid())
);

drop policy if exists "task_attachments_storage_delete" on storage.objects;
create policy "task_attachments_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'task-attachments'
  and public.can_access_task(public.storage_task_id(name), auth.uid())
);
