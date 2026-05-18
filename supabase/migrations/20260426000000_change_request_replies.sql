alter table public.change_requests
  add column if not exists reply_text text,
  add column if not exists reply_by_id uuid
    references public.contributors(id) on delete set null,
  add column if not exists reply_at timestamptz;
