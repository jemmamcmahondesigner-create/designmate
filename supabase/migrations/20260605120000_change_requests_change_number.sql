alter table public.change_requests
  add column if not exists change_number integer;
