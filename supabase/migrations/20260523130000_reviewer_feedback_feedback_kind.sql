-- Store per-submission feedback classification for Approve RHC / Decision Log.
alter table public.reviewer_feedback
  add column if not exists feedback_kind text;

alter table public.reviewer_feedback
  drop constraint if exists reviewer_feedback_feedback_kind_check;

alter table public.reviewer_feedback
  add constraint reviewer_feedback_feedback_kind_check
  check (feedback_kind is null or feedback_kind in ('approval', 'change-request', 'mixed', 'generic'));
