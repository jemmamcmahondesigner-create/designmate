-- One-off: collapse duplicate teammate identities created when signup joined
-- a workspace without claiming the pending invite, then prevent recurrence.
--
-- Keep the Active row (linked to a signed-up user). Delete orphaned Pending
-- rows for the same email. Remap contributor FKs before deleting profiles.

create temporary table _teammate_dup_contributors (
  drop_id uuid primary key,
  keep_id uuid not null
);

-- Workspace-level contributor duplicates: same workspace + email, keep the
-- row linked to an auth user (then earliest created_at).
insert into _teammate_dup_contributors (drop_id, keep_id)
select c.id, keeper.keep_id
from public.contributors c
join (
  select
    workspace_id,
    lower(trim(email)) as email_key,
    (
      array_agg(id order by
        (user_id is not null) desc,
        created_at asc nulls last,
        id asc
      )
    )[1] as keep_id
  from public.contributors
  where project_id is null
    and workspace_id is not null
    and email is not null
    and trim(email) <> ''
  group by workspace_id, lower(trim(email))
  having count(*) > 1
) keeper
  on keeper.workspace_id = c.workspace_id
 and keeper.email_key = lower(trim(c.email))
where c.project_id is null
  and c.id <> keeper.keep_id;

-- Prefer the invited display name when the kept row only has the email local-part.
update public.contributors keep
set name = pending.name
from _teammate_dup_contributors map
join public.contributors pending on pending.id = map.drop_id
where keep.id = map.keep_id
  and pending.name is not null
  and trim(pending.name) <> ''
  and (
    keep.name is null
    or trim(keep.name) = ''
    or keep.name = split_part(lower(coalesce(keep.email, '')), '@', 1)
  );

-- Remap FK references from dropped contributor ids onto the kept row.
update public.reviews r
set reviewer_contributor_ids = (
  select coalesce(array_agg(mapped.val), '{}')
  from (
    select distinct coalesce(map.keep_id, x) as val
    from unnest(r.reviewer_contributor_ids) as x
    left join _teammate_dup_contributors map on map.drop_id = x
  ) mapped
)
where exists (
  select 1
  from unnest(r.reviewer_contributor_ids) as x
  join _teammate_dup_contributors map on map.drop_id = x
);

update public.reviews r
set decision_owner_id = map.keep_id
from _teammate_dup_contributors map
where r.decision_owner_id = map.drop_id;

delete from public.reviewer_feedback rf
using _teammate_dup_contributors map
where rf.reviewer_id = map.drop_id
  and exists (
    select 1
    from public.reviewer_feedback kept
    where kept.review_id = rf.review_id
      and kept.reviewer_id = map.keep_id
  );

update public.reviewer_feedback rf
set reviewer_id = map.keep_id
from _teammate_dup_contributors map
where rf.reviewer_id = map.drop_id;

update public.reviewer_feedback rf
set reply_by_id = map.keep_id
from _teammate_dup_contributors map
where rf.reply_by_id = map.drop_id;

update public.change_requests cr
set reviewer_id = map.keep_id
from _teammate_dup_contributors map
where cr.reviewer_id = map.drop_id;

update public.change_requests cr
set completed_by_id = map.keep_id
from _teammate_dup_contributors map
where cr.completed_by_id = map.drop_id;

update public.change_requests cr
set submitted_by_id = map.keep_id
from _teammate_dup_contributors map
where cr.submitted_by_id = map.drop_id;

update public.change_request_replies crr
set reply_by_id = map.keep_id
from _teammate_dup_contributors map
where crr.reply_by_id = map.drop_id;

update public.card_replies cr
set reply_by_id = map.keep_id
from _teammate_dup_contributors map
where cr.reply_by_id = map.drop_id;

update public.timeline_events te
set actor_id = map.keep_id
from _teammate_dup_contributors map
where te.actor_id = map.drop_id;

update public.review_activity ra
set contributor_id = map.keep_id
from _teammate_dup_contributors map
where ra.contributor_id = map.drop_id;

update public.artifacts a
set created_by = map.keep_id
from _teammate_dup_contributors map
where a.created_by = map.drop_id;

update public.artifact_versions av
set created_by = map.keep_id
from _teammate_dup_contributors map
where av.created_by = map.drop_id;

update public.access_requests ar
set requested_by = map.keep_id
from _teammate_dup_contributors map
where ar.requested_by = map.drop_id;

update public.access_requests ar
set requested_to = map.keep_id
from _teammate_dup_contributors map
where ar.requested_to = map.drop_id;

delete from public.contributors c
using _teammate_dup_contributors map
where c.id = map.drop_id;

-- Pending workspace_members whose email already has an Active membership.
delete from public.workspace_members pending
where (pending.status = 'pending' or pending.user_id is null)
  and pending.invite_email is not null
  and trim(pending.invite_email) <> ''
  and exists (
    select 1
    from public.workspace_members active
    left join public.contributors c
      on c.user_id = active.user_id
     and c.workspace_id = active.workspace_id
     and c.project_id is null
    left join auth.users u on u.id = active.user_id
    where active.workspace_id = pending.workspace_id
      and active.id <> pending.id
      and active.user_id is not null
      and lower(coalesce(active.status, '')) = 'active'
      and (
        lower(trim(coalesce(active.invite_email, ''))) = lower(trim(pending.invite_email))
        or lower(trim(coalesce(c.email, ''))) = lower(trim(pending.invite_email))
        or lower(trim(coalesce(u.email, ''))) = lower(trim(pending.invite_email))
      )
  );

-- Leftover pending invites for emails that are already Active members.
update public.workspace_invites i
set status = 'accepted'
where i.status = 'pending'
  and exists (
    select 1
    from public.workspace_members active
    left join public.contributors c
      on c.user_id = active.user_id
     and c.workspace_id = active.workspace_id
     and c.project_id is null
    left join auth.users u on u.id = active.user_id
    where active.workspace_id = i.workspace_id
      and active.user_id is not null
      and lower(coalesce(active.status, '')) = 'active'
      and (
        lower(trim(coalesce(active.invite_email, ''))) = lower(trim(i.email))
        or lower(trim(coalesce(c.email, ''))) = lower(trim(i.email))
        or lower(trim(coalesce(u.email, ''))) = lower(trim(i.email))
      )
  );

-- Duplicate member rows that share an invite_email: keep Active + earliest.
delete from public.workspace_members wm
where wm.invite_email is not null
  and trim(wm.invite_email) <> ''
  and wm.id not in (
    select distinct on (workspace_id, lower(trim(invite_email))) id
    from public.workspace_members
    where invite_email is not null
      and trim(invite_email) <> ''
    order by
      workspace_id,
      lower(trim(invite_email)),
      (user_id is not null and lower(coalesce(status, '')) = 'active') desc,
      joined_at asc nulls last,
      id asc
  );

drop table if exists _teammate_dup_contributors;

create unique index if not exists workspace_members_workspace_invite_email_unique
  on public.workspace_members (workspace_id, lower(trim(invite_email)))
  where invite_email is not null
    and trim(invite_email) <> '';

create unique index if not exists contributors_workspace_profile_email_unique
  on public.contributors (workspace_id, lower(trim(email)))
  where project_id is null
    and workspace_id is not null
    and email is not null
    and trim(email) <> '';
