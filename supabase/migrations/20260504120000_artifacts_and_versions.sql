-- Canonical artifact identity and per-review versions.
--
-- EXISTING ARTIFACT DATA (no backfill in this migration):
-- - `public.reviews.artifacts` is a jsonb array of uploaded / link entries
--   (see Create Review flow in `lib/reviews/submitReviewClient.ts`). Optional
--   top-level columns `artifact_name`, `artifact_file_url`, etc. mirror the
--   first artifact for list views. This data can stay as-is for historical
--   reviews until you explicitly migrate jsonb rows into `artifact_versions`.
-- - New creates should populate `artifacts` + `artifact_versions` alongside
--   the jsonb payload until jsonb is retired.

-- Canonical artifact identity (the "thing" being designed)
create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references public.contributors(id),
  created_at timestamptz not null default now()
);

-- A specific version of an artifact, tied to a review
create table public.artifact_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.artifacts(id) on delete cascade,
  version_number integer not null default 1,
  review_id uuid references public.reviews(id) on delete set null,
  file_url text,
  link_url text,
  file_name text,
  file_type text,
  description text,
  created_by uuid references public.contributors(id),
  created_at timestamptz not null default now(),
  unique (artifact_id, version_number)
);

alter table public.artifacts enable row level security;
alter table public.artifact_versions enable row level security;

create policy "Allow all for now"
  on public.artifacts
  for all
  using (true)
  with check (true);

create policy "Allow all for now"
  on public.artifact_versions
  for all
  using (true)
  with check (true);
