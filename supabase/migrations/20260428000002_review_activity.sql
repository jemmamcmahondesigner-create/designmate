create table if not exists public.review_activity (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  contributor_id uuid references public.contributors(id) on delete set null,
  activity_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.review_activity enable row level security;

create policy "Allow all for now"
  on public.review_activity for all
  using (true) with check (true);
