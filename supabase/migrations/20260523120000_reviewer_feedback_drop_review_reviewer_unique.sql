-- Allow multiple reviewer_feedback rows per (review, reviewer) for submission history.
alter table public.reviewer_feedback
  drop constraint if exists reviewer_feedback_review_id_reviewer_id_key;

alter table public.reviewer_feedback
  drop constraint if exists reviewer_feedback_review_reviewer_unique;

drop index if exists public.reviewer_feedback_review_reviewer_unique;
