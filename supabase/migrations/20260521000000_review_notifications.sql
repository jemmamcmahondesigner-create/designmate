-- Review reminder rate limit + contributor notification preferences scaffold.

alter table public.reviews
  add column if not exists last_reminder_sent_at timestamptz;

alter table public.contributors
  add column if not exists notification_preferences jsonb default '{}'::jsonb;

-- Creator attribution for review notification emails (Part 2).
alter table public.reviews
  add column if not exists creator_id uuid references public.contributors(id) on delete set null;

update public.reviews r
set creator_id = sub.actor_id
from (
  select distinct on (review_id) review_id, actor_id
  from public.timeline_events
  where event_type = 'review_created'
    and actor_id is not null
  order by review_id, created_at asc
) sub
where r.id = sub.review_id
  and r.creator_id is null;
