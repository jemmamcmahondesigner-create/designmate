-- Add `complete` as the post-decision lifecycle status (designer-facing "Complete").
-- Legacy `approved` / `needs-changes` / `changes-needed` review rows remain valid.

alter table public.reviews drop constraint if exists reviews_status_check;

alter table public.reviews add constraint reviews_status_check
  check (status in (
    'draft',
    'in-review',
    'feedback-submitted',
    'complete',
    'paused',
    'approved',
    'needs-changes',
    'changes-needed',
    'blocked'
  ));
