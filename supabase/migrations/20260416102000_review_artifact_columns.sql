alter table public.reviews
  add column if not exists artifact_file_name text,
  add column if not exists artifact_file_type text check (artifact_file_type in ('figma', 'pdf')),
  add column if not exists artifact_name text,
  add column if not exists artifact_iteration text,
  add column if not exists artifact_description text,
  add column if not exists artifact_file_url text;
