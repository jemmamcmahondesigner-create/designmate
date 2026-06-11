alter table public.change_requests

  add column if not exists batch_number integer;

