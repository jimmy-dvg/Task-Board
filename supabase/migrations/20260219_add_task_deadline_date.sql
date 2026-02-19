alter table public.tasks
add column if not exists deadline_date date;

create index if not exists tasks_deadline_date_idx on public.tasks(deadline_date);