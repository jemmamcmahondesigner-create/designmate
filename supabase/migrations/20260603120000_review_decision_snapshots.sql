-- Historical compare/approve final decision snapshots (supports direction changes).

create table if not exists public.review_decision_snapshots (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  decision_status text not null,
  decision_comments text,
  decision_selected_artifact_ids text[],
  decision_owner_id uuid references public.contributors(id) on delete set null,
  decision_made_at timestamptz not null,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists review_decision_snapshots_review_id_idx
  on public.review_decision_snapshots (review_id, decision_made_at desc);

alter table public.review_decision_snapshots enable row level security;

drop policy if exists "Allow all for now" on public.review_decision_snapshots;
create policy "Allow all for now"
  on public.review_decision_snapshots
  for all
  using (true)
  with check (true);
