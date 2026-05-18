-- add_tradeoffs_to_reviews

alter table public.reviews
  add column if not exists tradeoffs jsonb default null;
