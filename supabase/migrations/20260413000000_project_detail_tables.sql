-- Problems, contributors, and source references for project detail.
-- Run via Supabase CLI or SQL editor. RLS is permissive until auth is added.

create table public.problems (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now()
);

alter table public.problems enable row level security;

create policy "Allow all for now"
  on public.problems
  for all
  using (true)
  with check (true);

create table public.contributors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  email text,
  role text,
  created_at timestamptz not null default now()
);

alter table public.contributors enable row level security;

create policy "Allow all for now"
  on public.contributors
  for all
  using (true)
  with check (true);

create table public.project_references (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  url text,
  file_name text,
  created_at timestamptz not null default now()
);

alter table public.project_references enable row level security;

create policy "Allow all for now"
  on public.project_references
  for all
  using (true)
  with check (true);
