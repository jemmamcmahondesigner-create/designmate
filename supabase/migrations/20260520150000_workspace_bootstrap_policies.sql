-- Allow authenticated users to create a new workspace
create policy "Authenticated users can create workspaces"
  on public.workspaces
  for insert
  to authenticated
  with check (true);

-- Allow the first admin member row to be inserted
-- during workspace creation (bootstrap problem)
-- The user inserting must be inserting themselves
create policy "Users can insert themselves as workspace admin"
  on public.workspace_members
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Allow workspace members to insert other members
-- (for invite flow — admin sends invite, creates pending row)
create policy "Admins can invite members to their workspace"
  on public.workspace_members
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members existing
      where existing.workspace_id = workspace_members.workspace_id
      and existing.user_id = auth.uid()
      and existing.role = 'admin'
    )
  );

-- Allow members to update their own row
-- (for accepting an invite: pending -> active)
create policy "Members can update their own membership"
  on public.workspace_members
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Projects: allow members to update projects in their workspace
create policy "Workspace members can update projects"
  on public.projects
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = projects.workspace_id
      and user_id = auth.uid()
    )
  );

-- Projects: allow admins and members to delete projects
create policy "Workspace members can delete projects"
  on public.projects
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = projects.workspace_id
      and user_id = auth.uid()
    )
  );

-- Contributors: scope to workspace
-- Select: members see contributors in their workspace
create policy "Workspace members see contributors"
  on public.contributors
  for select
  to authenticated
  using (
    workspace_id is null
    or exists (
      select 1 from public.workspace_members
      where workspace_id = contributors.workspace_id
      and user_id = auth.uid()
    )
  );

-- Contributors: insert scoped to workspace  
create policy "Workspace members can add contributors"
  on public.contributors
  for insert
  to authenticated
  with check (
    workspace_id is null
    or exists (
      select 1 from public.workspace_members
      where workspace_id = contributors.workspace_id
      and user_id = auth.uid()
    )
  );
