create table if not exists public.timeline_events (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  project_id uuid references public.projects(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  actor_id uuid references public.contributors(id),
  event_type text not null check (
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
      'concept_selected',
      'review_approved',
      'partial_approval',
      'reviewer_added',
      'status_changed',
      'decision_recorded',
      'review_deleted',
      'artifact_deleted'
    )
  ),
  payload jsonb default '{}'::jsonb
);

create index if not exists timeline_events_project_created_idx
  on public.timeline_events (project_id, created_at desc);
create index if not exists timeline_events_review_created_idx
  on public.timeline_events (review_id, created_at desc);

alter table public.timeline_events enable row level security;

drop policy if exists "Allow all for now" on public.timeline_events;
create policy "Allow all for now" on public.timeline_events
  using (true)
  with check (true);

do $$
declare
  p record;
  r record;
  actor uuid;
  anchor timestamptz;
begin
  for p in select id, name, created_at from public.projects loop
    select c.id into actor
    from public.contributors c
    where c.project_id = p.id
    order by c.created_at asc
    limit 1;

    if not exists (
      select 1 from public.timeline_events e
      where e.project_id = p.id and e.event_type = 'project_created'
    ) then
      insert into public.timeline_events (created_at, project_id, actor_id, event_type, payload)
      values (
        coalesce(p.created_at, now()),
        p.id,
        actor,
        'project_created',
        jsonb_build_object('project_name', coalesce(p.name, 'Project'))
      );
    end if;

    insert into public.timeline_events (created_at, project_id, actor_id, event_type, payload)
    select
      coalesce(pr.created_at, p.created_at + interval '2 day'),
      p.id,
      actor,
      'problem_added',
      jsonb_build_object('problem_text', coalesce(pr.description, 'Problem'))
    from public.problems pr
    where pr.project_id = p.id
      and not exists (
        select 1 from public.timeline_events e
        where e.project_id = p.id
          and e.event_type = 'problem_added'
          and e.payload->>'problem_text' = coalesce(pr.description, 'Problem')
      )
    limit 2;

    for r in
      select id, title, status, created_at, artifacts
      from public.reviews
      where project_id = p.id
      order by created_at asc
    loop
      if not exists (
        select 1 from public.timeline_events e
        where e.review_id = r.id and e.event_type = 'review_created'
      ) then
        insert into public.timeline_events (created_at, project_id, review_id, actor_id, event_type, payload)
        values (
          coalesce(r.created_at, p.created_at + interval '3 day'),
          p.id,
          r.id,
          actor,
          'review_created',
          jsonb_build_object(
            'review_title', coalesce(r.title, 'Review'),
            'review_id', r.id,
            'review_status', coalesce(r.status, 'in-review')
          )
        );
      end if;

      anchor := coalesce(r.created_at, p.created_at + interval '4 day');

      if not exists (select 1 from public.timeline_events e where e.review_id = r.id and e.event_type = 'artifact_uploaded') then
        insert into public.timeline_events (created_at, project_id, review_id, actor_id, event_type, payload)
        values (
          anchor + interval '2 day',
          p.id,
          r.id,
          actor,
          'artifact_uploaded',
          jsonb_build_object(
            'iteration_label', 'Iteration 1',
            'artifact_names', coalesce((select jsonb_agg(value->>'title') from jsonb_array_elements(coalesce(r.artifacts, '[]'::jsonb))), '[]'::jsonb)
          )
        );
      end if;

      if not exists (select 1 from public.timeline_events e where e.review_id = r.id and e.event_type = 'feedback_provided') then
        insert into public.timeline_events (created_at, project_id, review_id, actor_id, event_type, payload)
        values (
          anchor + interval '6 day',
          p.id,
          r.id,
          actor,
          'feedback_provided',
          jsonb_build_object('review_title', coalesce(r.title, 'Review'), 'review_id', r.id)
        );
      end if;

      if not exists (select 1 from public.timeline_events e where e.review_id = r.id and e.event_type in ('concept_selected', 'review_approved')) then
        insert into public.timeline_events (created_at, project_id, review_id, actor_id, event_type, payload)
        values (
          anchor + interval '10 day',
          p.id,
          r.id,
          actor,
          case when coalesce(r.status, '') = 'approved' then 'review_approved' else 'concept_selected' end,
          jsonb_build_object('review_title', coalesce(r.title, 'Review'), 'review_id', r.id, 'concept_name', 'Selected concept')
        );
      end if;
    end loop;
  end loop;
end $$;
