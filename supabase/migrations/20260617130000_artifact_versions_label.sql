-- Frozen display label per version row (name at save time; survives artifact renames).
alter table public.artifact_versions
  add column if not exists label text;

update public.artifact_versions av
set label = a.name
from public.artifacts a
where a.id = av.artifact_id
  and (av.label is null or btrim(av.label) = '');
