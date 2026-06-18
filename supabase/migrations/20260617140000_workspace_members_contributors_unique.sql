-- Workspace membership + workspace-profile contributor dedupe and named constraints.
-- Run in Supabase SQL Editor if not applied via migration tooling.

-- workspace_members: remove duplicate rows (keep earliest membership per user/workspace)
delete from public.workspace_members wm
where wm.id not in (
  select distinct on (user_id, workspace_id) id
  from public.workspace_members
  order by user_id, workspace_id, joined_at asc nulls last, id asc
);

-- Replace implicit unique(workspace_id, user_id) with named constraint if needed
alter table public.workspace_members
  drop constraint if exists workspace_members_workspace_id_user_id_key;

alter table public.workspace_members
  drop constraint if exists workspace_members_user_workspace_unique;

alter table public.workspace_members
  add constraint workspace_members_user_workspace_unique
  unique (user_id, workspace_id);

-- contributors: dedupe workspace-level profiles only (project_id is null)
delete from public.contributors c
where c.project_id is null
  and c.id not in (
    select distinct on (user_id, workspace_id) id
    from public.contributors
    where project_id is null
      and user_id is not null
      and workspace_id is not null
    order by user_id, workspace_id, created_at asc nulls last, id asc
  );

-- Partial unique: one workspace profile per user per workspace (project rows unchanged)
drop index if exists public.contributors_user_workspace_workspace_profile_unique;

create unique index contributors_user_workspace_workspace_profile_unique
  on public.contributors (user_id, workspace_id)
  where project_id is null
    and user_id is not null
    and workspace_id is not null;
