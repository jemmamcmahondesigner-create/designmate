alter table public.change_requests
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by_id uuid references public.contributors(id) on delete set null;
