-- Link change requests to reviewer_feedback submissions; track who submitted feedback.
alter table public.change_requests
  add column if not exists reviewer_feedback_id uuid references public.reviewer_feedback(id) on delete set null;

alter table public.reviewer_feedback
  add column if not exists submitted_by_id uuid references public.contributors(id) on delete set null;

-- Allow per-change activity entries on submit.
alter table public.timeline_events drop constraint if exists timeline_events_event_type_check;

alter table public.timeline_events add constraint timeline_events_event_type_check check (
  event_type in (
    'project_created',
    'problem_added',
    'problem_edited',
    'teammate_added',
    'review_created',
    'artifact_uploaded',
    'review_focus_edited',
    'feedback_provided',
    'changes_requested',
    'change_requested',
    'concept_selected',
    'review_approved',
    'partial_approval',
    'reviewer_added',
    'status_changed',
    'decision_recorded',
    'decision_made',
    'review_deleted',
    'artifact_deleted'
  )
);
