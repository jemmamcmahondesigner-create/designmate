-- Batch grouping for change requests submitted in the same modal session.

alter table public.change_requests
  add column if not exists batch_id uuid;
