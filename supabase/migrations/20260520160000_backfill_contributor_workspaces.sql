alter table public.contributors
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Temporarily allow: if a contributor has no workspace_id and there is only one workspace,
-- assign them to it. This handles the single-workspace dev/test scenario.
--
-- NOTE: This is a dev/test backfill only.
-- In production with multiple workspaces this would need manual assignment.

update public.contributors
set workspace_id = (
  select id from public.workspaces
  order by created_at asc
  limit 1
)
where workspace_id is null;

update public.projects
set workspace_id = (
  select id from public.workspaces
  order by created_at asc
  limit 1
)
where workspace_id is null;
