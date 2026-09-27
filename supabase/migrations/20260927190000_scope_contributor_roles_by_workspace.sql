-- Workspace-scope contributor_roles. NULL workspace_id = built-in default
-- visible to every tenant. Custom roles belong to one workspace.

alter table public.contributor_roles
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Product Owner is used by 8 contributors, all in 8c65cde0… and none elsewhere
-- (verified before apply). Guard refuses the write if that claim is no longer true.
update public.contributor_roles
set workspace_id = '8c65cde0-1368-4f08-8eae-ea7b63197833'
where id = 'eee0f947-f455-4518-b263-ef06f88f52ce'
  and not exists (
    select 1
    from public.contributors c
    where c.role_id = 'eee0f947-f455-4518-b263-ef06f88f52ce'
      and c.workspace_id is distinct from '8c65cde0-1368-4f08-8eae-ea7b63197833'
  );

create unique index if not exists contributor_roles_name_workspace_uidx
  on public.contributor_roles (
    lower(name),
    coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

drop policy if exists "Allow authenticated read on contributor_roles" on public.contributor_roles;
drop policy if exists contributor_roles_select on public.contributor_roles;
drop policy if exists contributor_roles_insert on public.contributor_roles;
drop policy if exists contributor_roles_update on public.contributor_roles;
drop policy if exists contributor_roles_delete on public.contributor_roles;

create policy contributor_roles_select on public.contributor_roles
  for select to authenticated
  using (workspace_id is null or workspace_id in (select public.get_my_workspace_ids()));

create policy contributor_roles_insert on public.contributor_roles
  for insert to authenticated
  with check (workspace_id in (select public.get_my_workspace_ids()));

create policy contributor_roles_update on public.contributor_roles
  for update to authenticated
  using (workspace_id in (select public.get_my_workspace_ids()))
  with check (workspace_id in (select public.get_my_workspace_ids()));

create policy contributor_roles_delete on public.contributor_roles
  for delete to authenticated
  using (workspace_id in (select public.get_my_workspace_ids()));

revoke all on public.contributor_roles from anon;
