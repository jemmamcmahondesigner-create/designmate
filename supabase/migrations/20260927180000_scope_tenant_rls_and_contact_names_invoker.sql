-- Tenant-scope leftover USING true policies and stop contact_names bypassing
-- contributors RLS. Do not revoke EXECUTE on get_my_workspace_ids() — reviews
-- SELECT depends on it. Do not change contributors anon table grants.

-- ---------------------------------------------------------------------------
-- 1. contact_names: inherit contributors RLS (security_invoker).
--    Callers pass ids from reviews / timeline the user can already read.
--    Those contributors live in the same workspace (or the two workspace_id
--    IS NULL rows, which the existing contributors SELECT still covers).
-- ---------------------------------------------------------------------------
drop view if exists public.contact_names;

create view public.contact_names
  with (security_invoker = on) as
  select c.id, c.name as display_name
  from public.contributors c;

revoke all on public.contact_names from anon;
grant select on public.contact_names to authenticated;

-- ---------------------------------------------------------------------------
-- 2. sources — workspace_id, with project fallback for any un-backfilled rows
-- ---------------------------------------------------------------------------
drop policy if exists "Allow all for now" on public.sources;

create policy "sources_workspace_scoped"
  on public.sources
  for all
  to authenticated
  using (
    workspace_id in (select public.get_my_workspace_ids())
    or project_id in (
      select p.id
      from public.projects p
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  )
  with check (
    workspace_id in (select public.get_my_workspace_ids())
    or project_id in (
      select p.id
      from public.projects p
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. clients — workspace_id
-- ---------------------------------------------------------------------------
drop policy if exists "clients_select" on public.clients;
drop policy if exists "clients_insert" on public.clients;
drop policy if exists "clients_update" on public.clients;
drop policy if exists "clients_delete" on public.clients;

create policy "clients_workspace_scoped"
  on public.clients
  for all
  to authenticated
  using (workspace_id in (select public.get_my_workspace_ids()))
  with check (workspace_id in (select public.get_my_workspace_ids()));

-- ---------------------------------------------------------------------------
-- 4. review_sources — review → project → workspace
-- ---------------------------------------------------------------------------
drop policy if exists "Allow all for now" on public.review_sources;

create policy "review_sources_workspace_scoped"
  on public.review_sources
  for all
  to authenticated
  using (
    review_id in (
      select r.id
      from public.reviews r
      join public.projects p on p.id = r.project_id
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  )
  with check (
    review_id in (
      select r.id
      from public.reviews r
      join public.projects p on p.id = r.project_id
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. access_requests — project_id or review_id → workspace
-- ---------------------------------------------------------------------------
drop policy if exists "Allow all for now" on public.access_requests;

create policy "access_requests_workspace_scoped"
  on public.access_requests
  for all
  to authenticated
  using (
    project_id in (
      select p.id
      from public.projects p
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
    or review_id in (
      select r.id
      from public.reviews r
      join public.projects p on p.id = r.project_id
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  )
  with check (
    project_id in (
      select p.id
      from public.projects p
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
    or review_id in (
      select r.id
      from public.reviews r
      join public.projects p on p.id = r.project_id
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. contributors UPDATE only — leave SELECT (workspace_id IS NULL OR member)
--    alone; that IS NULL branch is load-bearing for the two leftover rows and
--    was not proven unused by the workspace-level fallback this round.
-- ---------------------------------------------------------------------------
drop policy if exists "Allow update for now" on public.contributors;

create policy "contributors_update_workspace"
  on public.contributors
  for update
  to authenticated
  using (workspace_id in (select public.get_my_workspace_ids()))
  with check (workspace_id in (select public.get_my_workspace_ids()));

-- ---------------------------------------------------------------------------
-- 7. contributor_roles — global lookup, no tenant data. SELECT only.
-- ---------------------------------------------------------------------------
drop policy if exists "contributor_roles_insert" on public.contributor_roles;
drop policy if exists "contributor_roles_update" on public.contributor_roles;
drop policy if exists "contributor_roles_delete" on public.contributor_roles;
drop policy if exists "Allow all for now" on public.contributor_roles;
