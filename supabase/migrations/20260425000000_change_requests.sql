create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reviewer_id uuid references public.contributors(id) on delete set null,
  artifact_ids uuid[] not null default '{}',
  changes_needed text,
  created_at timestamptz not null default now()
);

alter table public.change_requests enable row level security;

drop policy if exists "Allow all for now" on public.change_requests;
create policy "Allow all for now"
  on public.change_requests
  for all
  using (true)
  with check (true);
