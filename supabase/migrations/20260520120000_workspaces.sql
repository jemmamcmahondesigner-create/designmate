create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists workspaces_name_lower_idx
  on public.workspaces (lower(trim(name)));

alter table public.projects
  add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;

alter table public.workspaces enable row level security;

create policy "Allow all for now"
  on public.workspaces
  for all
  using (true)
  with check (true);
