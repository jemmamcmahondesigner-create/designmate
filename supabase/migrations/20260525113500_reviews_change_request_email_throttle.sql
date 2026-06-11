alter table public.reviews
  add column if not exists last_change_request_email_sent_at timestamptz;
