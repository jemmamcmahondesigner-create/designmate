-- Design reviews linked to projects (Create Review flow).

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  review_type text not null
    check (review_type in ('compare', 'critique', 'align', 'approve')),
  send_notification boolean not null default true,
  review_focus text,
  related_problem_ids uuid[] not null default '{}',
  reviewer_contributor_ids uuid[] not null default '{}',
  require_decision_maker boolean not null default false,
  owner_display_name text not null,
  artifacts jsonb not null default '[]'::jsonb,
  status text not null default 'in-review'
    check (status in ('in-review', 'approved', 'needs-changes', 'blocked')),
  created_at timestamptz not null default now()
);

create index reviews_project_id_created_at_idx
  on public.reviews (project_id, created_at desc);

alter table public.reviews enable row level security;

create policy "Allow all for now"
  on public.reviews
  for all
  using (true)
  with check (true);

-- Storage for uploaded review artifacts (files).
insert into storage.buckets (id, name, public)
values ('review-artifacts', 'review-artifacts', true)
on conflict (id) do nothing;

drop policy if exists "review-artifacts read" on storage.objects;
drop policy if exists "review-artifacts insert" on storage.objects;
drop policy if exists "review-artifacts update" on storage.objects;
drop policy if exists "review-artifacts delete" on storage.objects;

create policy "review-artifacts read"
  on storage.objects for select
  using (bucket_id = 'review-artifacts');

create policy "review-artifacts insert"
  on storage.objects for insert
  with check (bucket_id = 'review-artifacts');

create policy "review-artifacts update"
  on storage.objects for update
  using (bucket_id = 'review-artifacts')
  with check (bucket_id = 'review-artifacts');

create policy "review-artifacts delete"
  on storage.objects for delete
  using (bucket_id = 'review-artifacts');
