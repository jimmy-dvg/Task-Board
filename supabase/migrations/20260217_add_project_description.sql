alter table public.projects
add column if not exists description text not null default '';
