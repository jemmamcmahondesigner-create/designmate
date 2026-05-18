alter table public.reviews
  add column if not exists decision_status text
    check (decision_status in ('approved', 'changes-needed'))
    default null,
  add column if not exists decision_made_at timestamptz default null,
  add column if not exists decision_owner_id uuid references public.contributors(id) default null,
  add column if not exists decision_comments text default null,
  add column if not exists decision_selected_artifact_ids jsonb default null,
  add column if not exists decision_trade_off_note text default null,
  add column if not exists decision_trade_off_is_ai boolean default false;

do $$
declare
  status_constraint_def text;
begin
  select pg_get_constraintdef(c.oid)
  into status_constraint_def
  from pg_constraint c
  join pg_class t on c.conrelid = t.oid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'reviews'
    and c.conname = 'reviews_status_check';

  if status_constraint_def is null or position('feedback-submitted' in status_constraint_def) = 0 then
    alter table public.reviews
      drop constraint if exists reviews_status_check;

    alter table public.reviews
      add constraint reviews_status_check
      check (status in (
        'draft', 'in-review', 'feedback-submitted',
        'approved', 'changes-needed', 'paused'
      ));
  end if;
end
$$;
