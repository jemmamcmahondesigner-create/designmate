-- workspace_members.permission_level: access level (admin | editor | reviewer)
alter table public.workspace_members
  add column if not exists permission_level text not null default 'editor';

alter table public.workspace_members
  drop constraint if exists workspace_members_permission_level_check;

alter table public.workspace_members
  add constraint workspace_members_permission_level_check
  check (permission_level in ('admin', 'editor', 'reviewer'));

-- Backfill from legacy role where permission_level was default only
update public.workspace_members
set permission_level = case
  when role = 'admin' then 'admin'
  else 'editor'
end
where permission_level = 'editor' and role = 'admin';
