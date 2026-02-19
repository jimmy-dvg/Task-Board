create table if not exists public.task_activity_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(trim(action)) > 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_logs_project_created_idx
  on public.task_activity_logs(project_id, created_at desc);
create index if not exists task_activity_logs_task_created_idx
  on public.task_activity_logs(task_id, created_at desc);

alter table public.task_activity_logs enable row level security;

drop policy if exists "task_activity_logs_select_accessible_projects" on public.task_activity_logs;
create policy "task_activity_logs_select_accessible_projects"
on public.task_activity_logs
for select
to authenticated
using (
  public.is_project_owner(project_id, auth.uid())
  or public.is_project_member(project_id, auth.uid())
  or public.is_admin(auth.uid())
);

create or replace function public.tasks_activity_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_fields text[] := array[]::text[];
begin
  if tg_op = 'INSERT' then
    insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
    values (
      new.project_id,
      new.id,
      auth.uid(),
      'task_created',
      jsonb_build_object(
        'task_title', new.title,
        'stage_id', new.stage_id,
        'done', new.done,
        'deadline_date', new.deadline_date
      )
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
    values (
      old.project_id,
      old.id,
      auth.uid(),
      'task_deleted',
      jsonb_build_object(
        'task_title', old.title,
        'stage_id', old.stage_id,
        'done', old.done,
        'deadline_date', old.deadline_date
      )
    );

    return old;
  end if;

  if new.title is distinct from old.title then
    changed_fields := array_append(changed_fields, 'title');
  end if;

  if new.description_html is distinct from old.description_html then
    changed_fields := array_append(changed_fields, 'description_html');
  end if;

  if new.stage_id is distinct from old.stage_id then
    changed_fields := array_append(changed_fields, 'stage_id');
  end if;

  if new.done is distinct from old.done then
    changed_fields := array_append(changed_fields, 'done');
  end if;

  if new.order_position is distinct from old.order_position then
    changed_fields := array_append(changed_fields, 'order_position');
  end if;

  if new.deadline_date is distinct from old.deadline_date then
    changed_fields := array_append(changed_fields, 'deadline_date');
  end if;

  if coalesce(array_length(changed_fields, 1), 0) = 0 then
    return new;
  end if;

  insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
  values (
    new.project_id,
    new.id,
    auth.uid(),
    'task_updated',
    jsonb_build_object(
      'task_title', new.title,
      'changed_fields', to_jsonb(changed_fields),
      'before', jsonb_build_object(
        'title', old.title,
        'stage_id', old.stage_id,
        'done', old.done,
        'order_position', old.order_position,
        'deadline_date', old.deadline_date
      ),
      'after', jsonb_build_object(
        'title', new.title,
        'stage_id', new.stage_id,
        'done', new.done,
        'order_position', new.order_position,
        'deadline_date', new.deadline_date
      )
    )
  );

  return new;
end;
$$;

drop trigger if exists tasks_activity_log_trigger on public.tasks;
create trigger tasks_activity_log_trigger
after insert or update or delete on public.tasks
for each row
execute function public.tasks_activity_log_trigger();

create or replace function public.task_comments_activity_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_task_title text;
  v_comment text;
begin
  if tg_op = 'DELETE' then
    v_comment := old.body;

    select t.project_id, t.title
      into v_project_id, v_task_title
    from public.tasks t
    where t.id = old.task_id;

    if v_project_id is null then
      return old;
    end if;

    insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
    values (
      v_project_id,
      old.task_id,
      auth.uid(),
      'task_comment_deleted',
      jsonb_build_object(
        'task_title', v_task_title,
        'comment_preview', left(coalesce(v_comment, ''), 120)
      )
    );

    return old;
  end if;

  v_comment := new.body;

  select t.project_id, t.title
    into v_project_id, v_task_title
  from public.tasks t
  where t.id = new.task_id;

  if v_project_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
    values (
      v_project_id,
      new.task_id,
      auth.uid(),
      'task_comment_added',
      jsonb_build_object(
        'task_title', v_task_title,
        'comment_preview', left(coalesce(v_comment, ''), 120)
      )
    );

    return new;
  end if;

  if new.body is distinct from old.body then
    insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
    values (
      v_project_id,
      new.task_id,
      auth.uid(),
      'task_comment_updated',
      jsonb_build_object(
        'task_title', v_task_title,
        'comment_preview', left(coalesce(v_comment, ''), 120)
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists task_comments_activity_log_trigger on public.task_comments;
create trigger task_comments_activity_log_trigger
after insert or update or delete on public.task_comments
for each row
execute function public.task_comments_activity_log_trigger();

create or replace function public.task_attachments_activity_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_task_title text;
  v_task_id uuid;
  v_file_name text;
begin
  if tg_op = 'DELETE' then
    v_task_id := old.task_id;
    v_file_name := old.file_name;
  else
    v_task_id := new.task_id;
    v_file_name := new.file_name;
  end if;

  select t.project_id, t.title
    into v_project_id, v_task_title
  from public.tasks t
  where t.id = v_task_id;

  if v_project_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
    values (
      v_project_id,
      v_task_id,
      auth.uid(),
      'task_attachment_added',
      jsonb_build_object(
        'task_title', v_task_title,
        'file_name', v_file_name
      )
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
    values (
      v_project_id,
      v_task_id,
      auth.uid(),
      'task_attachment_removed',
      jsonb_build_object(
        'task_title', v_task_title,
        'file_name', v_file_name
      )
    );

    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists task_attachments_activity_log_trigger on public.task_attachments;
create trigger task_attachments_activity_log_trigger
after insert or delete on public.task_attachments
for each row
execute function public.task_attachments_activity_log_trigger();

create or replace function public.task_labels_activity_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_task_title text;
  v_task_id uuid;
  v_label_id uuid;
  v_label_name text;
begin
  if tg_op = 'DELETE' then
    v_task_id := old.task_id;
    v_label_id := old.label_id;
  else
    v_task_id := new.task_id;
    v_label_id := new.label_id;
  end if;

  select t.project_id, t.title
    into v_project_id, v_task_title
  from public.tasks t
  where t.id = v_task_id;

  if v_project_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  select pl.name
    into v_label_name
  from public.project_labels pl
  where pl.id = v_label_id;

  if tg_op = 'INSERT' then
    insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
    values (
      v_project_id,
      v_task_id,
      auth.uid(),
      'task_label_added',
      jsonb_build_object(
        'task_title', v_task_title,
        'label_name', coalesce(v_label_name, '')
      )
    );

    return new;
  end if;

  insert into public.task_activity_logs (project_id, task_id, actor_id, action, details)
  values (
    v_project_id,
    v_task_id,
    auth.uid(),
    'task_label_removed',
    jsonb_build_object(
      'task_title', v_task_title,
      'label_name', coalesce(v_label_name, '')
    )
  );

  return old;
end;
$$;

drop trigger if exists task_labels_activity_log_trigger on public.task_labels;
create trigger task_labels_activity_log_trigger
after insert or delete on public.task_labels
for each row
execute function public.task_labels_activity_log_trigger();