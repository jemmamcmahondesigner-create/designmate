-- Persist AI / create-flow tradeoffs on the review row (jsonb array).

alter table public.reviews
  add column if not exists tradeoffs jsonb;

comment on column public.reviews.tradeoffs is
  'Optional array of { description, severity, artifactLabel } from create review / AI.';
