create extension if not exists "pgcrypto";

do $$
declare
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  delete from auth.identities
  where email in ('steve@gmail.com', 'maria@gmail.com', 'peter@gmail.com')
     or user_id in (
       select id
       from auth.users
       where email in ('steve@gmail.com', 'maria@gmail.com', 'peter@gmail.com')
     );

  delete from auth.users
  where email in ('steve@gmail.com', 'maria@gmail.com', 'peter@gmail.com');

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (
      v_instance_id,
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'steve@gmail.com',
      extensions.crypt('pass123', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      v_instance_id,
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'maria@gmail.com',
      extensions.crypt('pass123', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      v_instance_id,
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      'peter@gmail.com',
      extensions.crypt('pass123', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    );

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    u.id::text,
    u.id,
    jsonb_build_object(
      'sub', u.id::text,
      'email', u.email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  from auth.users u
  where u.email in ('steve@gmail.com', 'maria@gmail.com', 'peter@gmail.com')
    and not exists (
      select 1
      from auth.identities i
      where i.provider = 'email'
        and i.user_id = u.id
    );
end $$;

with seeded_users as (
  select id, email
  from auth.users
  where email in ('steve@gmail.com', 'maria@gmail.com', 'peter@gmail.com')
), cleaned as (
  delete from public.projects p
  using seeded_users su
  where p.owner_id = su.id
  returning p.id
), ins_projects as (
  insert into public.projects (owner_id, name)
  select
    su.id,
    format('%s - Project %s', split_part(su.email, '@', 1), gs.project_no)
  from seeded_users su
  cross join (values (1), (2)) as gs(project_no)
  returning id, owner_id
), ins_stages as (
  insert into public.project_stages (project_id, name, order_position)
  select
    p.id,
    s.name,
    s.order_position
  from ins_projects p
  cross join (
    values
      ('Not Started', 1),
      ('In Progress', 2),
      ('Done', 3)
  ) as s(name, order_position)
  returning id, project_id, name
), task_template as (
  select *
  from (
    values
      ('Task 1',  'Not Started', 1, false),
      ('Task 2',  'In Progress', 1, false),
      ('Task 3',  'Done', 1, true),
      ('Task 4',  'Not Started', 2, false),
      ('Task 5',  'In Progress', 2, false),
      ('Task 6',  'Done', 2, true),
      ('Task 7',  'Not Started', 3, false),
      ('Task 8',  'In Progress', 3, false),
      ('Task 9',  'Done', 3, true),
      ('Task 10', 'In Progress', 4, false)
  ) as t(title, stage_name, order_position, done)
)
insert into public.tasks (
  project_id,
  stage_id,
  title,
  description_html,
  order_position,
  done
)
select
  p.id,
  s.id,
  tt.title,
  format('<p>Sample description for %s in %s.</p>', tt.title, tt.stage_name),
  tt.order_position,
  tt.done
from ins_projects p
join ins_stages s
  on s.project_id = p.id
join task_template tt
  on tt.stage_name = s.name;
