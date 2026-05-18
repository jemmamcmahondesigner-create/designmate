-- Nullable completion timestamp for cycle-time analytics (set when status becomes `complete`).

alter table public.reviews
  add column if not exists completed_at timestamptz null;

create or replace function public.reviews_set_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'complete' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.completed_at is null then
      new.completed_at := timezone('utc', now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_set_completed_at on public.reviews;

create trigger reviews_set_completed_at
  before insert or update on public.reviews
  for each row
  execute procedure public.reviews_set_completed_at();
