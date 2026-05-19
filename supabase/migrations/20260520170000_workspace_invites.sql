create table public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  invited_by uuid references auth.users(id) on delete set null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 32),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create unique index workspace_invites_workspace_email_idx
  on public.workspace_invites (workspace_id, email);

alter table public.workspace_invites enable row level security;

create policy "Workspace members can read invites for their workspace"
  on public.workspace_invites for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_invites.workspace_id
        and wm.user_id = auth.uid()
    )
  );

create policy "Admins manage invites"
  on public.workspace_invites for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_invites.workspace_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Admins update invites"
  on public.workspace_invites for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_invites.workspace_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Service role full access"
  on public.workspace_invites for all
  to service_role
  using (true)
  with check (true);
