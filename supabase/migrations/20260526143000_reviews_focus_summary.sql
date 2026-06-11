alter table public.reviews
  add column if not exists review_focus_summary text,
  add column if not exists review_focus_summary_source text;
