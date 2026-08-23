-- One-off cleanup preview + apply for duplicate teammate rows
-- (same email, leftover Pending invite + Active signup row).
--
-- 1. Run the PREVIEW queries below in the Supabase SQL editor.
-- 2. Apply supabase/migrations/20260823160000_teammate_email_unique_and_dedupe.sql
--    on the same database (beta/prod). Do not build UI for this.

-- Preview: duplicate workspace_members by invite email
select
  workspace_id,
  lower(trim(invite_email)) as email,
  count(*) as member_rows,
  count(*) filter (where status = 'pending' or user_id is null) as pending_rows,
  count(*) filter (where status = 'active' and user_id is not null) as active_rows
from public.workspace_members
where invite_email is not null
  and trim(invite_email) <> ''
group by workspace_id, lower(trim(invite_email))
having count(*) > 1
order by count(*) desc;

-- Preview: pending invites whose email is already an active member
select
  i.workspace_id,
  i.email,
  i.status as invite_status,
  i.invited_name
from public.workspace_invites i
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

-- Preview: duplicate workspace-level contributor profiles by email
select
  workspace_id,
  lower(trim(email)) as email,
  count(*) as profile_rows,
  count(*) filter (where user_id is null) as pending_profiles,
  count(*) filter (where user_id is not null) as linked_profiles
from public.contributors
where project_id is null
  and email is not null
  and trim(email) <> ''
group by workspace_id, lower(trim(email))
having count(*) > 1
order by count(*) desc;
