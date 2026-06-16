alter table public.workspace_members
  add column if not exists reviewer_type text
  not null default 'open'
  check (reviewer_type in ('open', 'assigned'));
