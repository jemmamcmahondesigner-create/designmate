-- Allow multiple feedback rows per (review, reviewer) for additional feedback threads.
drop index if exists public.reviewer_feedback_review_reviewer_unique;
