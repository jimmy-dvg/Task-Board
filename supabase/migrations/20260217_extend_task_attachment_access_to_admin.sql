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
        or public.is_admin(p_user_id)
      )
  );
$$;
