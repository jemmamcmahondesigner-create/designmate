-- Scope workspace name uniqueness to the owner (created_by), not globally.
-- Partial index: only rows with a known owner participate in uniqueness.
-- Multiple workspaces with created_by IS NULL may share the same name.

drop index if exists public.workspaces_name_lower_idx;

create unique index workspaces_name_lower_per_owner_idx
  on public.workspaces (created_by, lower(trim(name)))
  where created_by is not null;
