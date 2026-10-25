-- Who logged a change request (self or on-behalf). Nullable so existing rows stay valid.
alter table public.change_requests
  add column if not exists submitted_by_id uuid references public.contributors(id) on delete set null;
