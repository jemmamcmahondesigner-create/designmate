alter table public.workspace_invites
  add column if not exists invited_name text,
  add column if not exists job_role text;
