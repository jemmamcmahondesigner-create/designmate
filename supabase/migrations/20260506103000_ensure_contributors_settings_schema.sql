-- Hosted verification (run in Supabase SQL editor):
--   SELECT column_name
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'contributors'
--   ORDER BY column_name;
--
-- Expected for Settings / Teammates alongside existing columns:
--   deleted_at, is_paid, permission_level, role_id
--
-- This file is idempotent if 20260505165000_settings_teammates.sql already ran.

create table if not exists public.contributor_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table public.contributors
  add column if not exists role_id uuid references public.contributor_roles(id) on delete set null;

alter table public.contributors
  add column if not exists permission_level text;

alter table public.contributors
  add column if not exists is_paid boolean;

alter table public.contributors
  add column if not exists deleted_at timestamptz;

update public.contributors
set permission_level = 'editor'
where permission_level is null;

update public.contributors
set is_paid = true
where is_paid is null;
