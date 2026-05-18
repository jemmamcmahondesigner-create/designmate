-- Read-only mapping of contributor ids to display names for joins in the app.
-- Backed by `contributors` so names stay in sync without duplicate writes.

create or replace view public.contact_names as
  select
    c.id,
    c.name as display_name
  from public.contributors c;

grant select on public.contact_names to anon, authenticated;

-- Allow `rejected` on decision summary alongside legacy spellings.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'reviews'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%decision_status%'
  loop
    execute format('alter table public.reviews drop constraint if exists %I', r.conname);
  end loop;
end
$$;

alter table public.reviews
  add constraint reviews_decision_status_check
  check (
    decision_status is null
    or decision_status in (
      'in-review',
      'approved',
      'needs-changes',
      'changes-needed',
      'blocked',
      'draft',
      'rejected'
    )
  );
