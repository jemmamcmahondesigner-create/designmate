-- workspace_members: maps users to workspaces with roles
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  invite_email text,
  status text not null default 'active'
    check (status in ('pending', 'active')),
  joined_at timestamptz default now(),
  unique(workspace_id, user_id)
);

-- scope contributors to workspaces
alter table public.contributors
  add column if not exists workspace_id uuid
  references public.workspaces(id) on delete cascade;

-- active workspace on profiles
alter table public.contributors
  add column if not exists active_workspace_id uuid
  references public.workspaces(id) on delete set null;

-- RLS on workspace_members
alter table public.workspace_members enable row level security;

create policy "Members see their own workspace memberships"
  on public.workspace_members for select
  using (user_id = auth.uid());

create policy "Admins manage workspace members"
  on public.workspace_members for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'admin'
    )
  );

-- RLS on workspaces: users see workspaces they belong to
drop policy if exists "Allow all for now" on public.workspaces;

create policy "Members see their workspaces"
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspaces.id
      and user_id = auth.uid()
    )
  );

create policy "Admins update workspaces"
  on public.workspaces for update
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspaces.id
      and user_id = auth.uid()
      and role = 'admin'
    )
  );

-- RLS on projects: scoped to workspace
drop policy if exists "Allow all for now" on public.projects;

create policy "Workspace members see projects"
  on public.projects for select
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = projects.workspace_id
      and user_id = auth.uid()
    )
  );

create policy "Editors insert projects"
  on public.projects for insert
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = projects.workspace_id
      and user_id = auth.uid()
    )
  );
