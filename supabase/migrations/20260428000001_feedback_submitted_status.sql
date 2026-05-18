alter table public.reviews drop constraint if exists reviews_status_check;

alter table public.reviews add constraint reviews_status_check
  check (status in ('in-review', 'approved', 'needs-changes', 'blocked', 'draft', 'feedback-submitted'));
