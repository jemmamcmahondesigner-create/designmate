create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  requested_by uuid not null references public.contributors(id),
  requested_to uuid references public.contributors(id),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint access_request_target_check check (
    (project_id is not null and review_id is null) or
    (project_id is null and review_id is not null)
  )
);

create index idx_access_requests_project on public.access_requests(project_id);
create index idx_access_requests_review on public.access_requests(review_id);
create index idx_access_requests_requester on public.access_requests(requested_by);

alter table public.access_requests enable row level security;

create policy "Allow all for now" on public.access_requests
  for all using (true) with check (true);

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
    'review_paused',
    'review_reactivated',
    'decision_recorded',
    'decision_made',
    'review_deleted',
    'artifact_deleted',
    'artifact_description_edited',
    'project_updated',
    'access_requested',
    'access_granted'
  )
);
