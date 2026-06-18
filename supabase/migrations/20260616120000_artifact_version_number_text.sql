-- Artifact sub-versioning: version_number as text (v1, v2.1, v2.2, …)
-- Apply via Supabase SQL Editor if not already applied to hosted instance.

alter table public.artifact_versions
  drop constraint if exists artifact_versions_artifact_id_version_number_key;

alter table public.artifact_versions
  alter column version_number type text using version_number::text;

alter table public.artifact_versions
  add constraint artifact_versions_artifact_id_version_number_key
  unique (artifact_id, version_number);

update public.artifact_versions
set version_number = 'v' || version_number
where version_number not like 'v%';
