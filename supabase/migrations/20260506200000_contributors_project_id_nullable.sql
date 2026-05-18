-- Settings / Teammates adds workspace-scoped contributors without a single project.
-- project_id remains set for project-detail contributors.

alter table public.contributors
  alter column project_id drop not null;

comment on column public.contributors.project_id is
  'Null = workspace teammate (Settings). Non-null = project roster. TODO: wire to workspace_id when workspace model is implemented.';
