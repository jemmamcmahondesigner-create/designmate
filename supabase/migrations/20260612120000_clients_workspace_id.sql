-- Scope clients to workspaces. Backfill from projects; split shared "Internal" row per workspace.

alter table public.clients
  add column if not exists workspace_id uuid references public.workspaces (id);

-- Backfill clients referenced by projects in exactly one distinct workspace.
with single_workspace_clients as (
  select
    client_id,
    min(workspace_id) as workspace_id
  from public.projects
  where client_id is not null
    and workspace_id is not null
  group by client_id
  having count(distinct workspace_id) = 1
)
update public.clients c
set workspace_id = swc.workspace_id
from single_workspace_clients swc
where c.id = swc.client_id
  and c.workspace_id is null;

-- Split shared "Internal" client across three workspaces.
do $$
declare
  internal_id constant uuid := '6c5e3962-eecd-4de1-a2fe-3ab8f640bf28';
  ws_home constant uuid := '8c65cde0-1368-4f08-8eae-ea7b63197833';
  ws_b constant uuid := '1828410b-59d9-4aaf-804a-52fa7ce29ad8';
  ws_c constant uuid := '81e6aef4-ad3d-4d22-8c0b-b56056b3b283';
  new_client_b uuid;
  new_client_c uuid;
begin
  if not exists (select 1 from public.clients where id = internal_id) then
    raise notice 'Internal client row not found — skipping split';
    return;
  end if;

  update public.clients
  set workspace_id = ws_home
  where id = internal_id;

  insert into public.clients (name, industry, website, workspace_id)
  select name, industry, website, ws_b
  from public.clients
  where id = internal_id
  returning id into new_client_b;

  update public.projects
  set client_id = new_client_b
  where client_id = internal_id
    and workspace_id = ws_b;

  insert into public.clients (name, industry, website, workspace_id)
  select name, industry, website, ws_c
  from public.clients
  where id = internal_id
  returning id into new_client_c;

  update public.projects
  set client_id = new_client_c
  where client_id = internal_id
    and workspace_id = ws_c;
end $$;

-- Orphans ("Creative Canvas Marketing", "Peak Digital Solutions") intentionally left workspace_id null.
