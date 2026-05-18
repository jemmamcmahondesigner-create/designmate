-- Settings / Teammates data model support
-- Adds normalized contributor roles and teammate permission fields.

create table if not exists public.contributor_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.contributor_roles (name)
values ('Designer'), ('Product Manager'), ('Engineer'), ('Stakeholder')
on conflict (name) do nothing;

alter table public.contributors
  add column if not exists role_id uuid references public.contributor_roles(id) on delete set null,
  add column if not exists permission_level text not null default 'editor',
  add column if not exists is_paid boolean not null default true,
  add column if not exists deleted_at timestamptz;

update public.contributors c
set role_id = r.id
from public.contributor_roles r
where c.role_id is null
  and c.role is not null
  and lower(trim(c.role)) = lower(r.name);

alter table public.contributors
  drop constraint if exists contributors_permission_level_check;

alter table public.contributors
  add constraint contributors_permission_level_check
  check (permission_level in ('admin', 'editor', 'reviewer'));
