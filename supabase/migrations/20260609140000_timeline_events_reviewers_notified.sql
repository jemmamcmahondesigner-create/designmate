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
    'tradeoff_added',
    'tradeoff_edited',
    'feedback_provided',
    'changes_requested',
    'change_requested',
    'change_request_closed',
    'concept_selected',
    'review_approved',
    'partial_approval',
    'reviewer_added',
    'reviewers_notified',
    'status_changed',
    'decision_recorded',
    'decision_made',
    'review_deleted',
    'artifact_deleted'
  )
);
