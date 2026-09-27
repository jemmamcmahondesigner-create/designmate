-- Genuinely public brand assets (email wordmark). Images only, small cap.
-- Customer buckets stay untouched here so the wordmark can be copied before
-- project-references is set private.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-assets',
  'public-assets',
  true,
  524288,
  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists public_assets_select on storage.objects;

create policy public_assets_select on storage.objects
  for select
  to public
  using (bucket_id = 'public-assets');
