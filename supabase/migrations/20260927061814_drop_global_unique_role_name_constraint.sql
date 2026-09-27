-- Pulled from remote (applied 2026-09-27 06:18:14). Drops the old global
-- unique role name so two workspaces can share a title. Replaced by
-- contributor_roles_name_workspace_uidx in 20260927190000.

alter table public.contributor_roles
  drop constraint if exists contributor_roles_name_key;

drop index if exists public.contributor_roles_name_key;
drop index if exists public.contributor_roles_name_uidx;
