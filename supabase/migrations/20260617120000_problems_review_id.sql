-- Review-specific problems: scoped to a single review (not shown on project detail).
alter table public.problems
  add column if not exists review_id uuid references public.reviews(id) on delete cascade;

create index if not exists idx_problems_review_id on public.problems(review_id);
