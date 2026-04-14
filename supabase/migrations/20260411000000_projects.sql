-- Run in Supabase SQL editor or via CLI. RLS is permissive until auth is added.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Allow all for now"
  on public.projects
  for all
  using (true)
  with check (true);
