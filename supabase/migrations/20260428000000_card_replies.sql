-- Multiple replies per feedback / change request card (append-only).

create table if not exists public.card_replies (
  id uuid primary key default gen_random_uuid(),
  card_type text not null check (card_type in ('feedback', 'change_request')),
  card_id uuid not null,
  reply_text text not null,
  reply_by_id uuid references public.contributors(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.card_replies enable row level security;

create policy "Allow all for now"
  on public.card_replies for all using (true) with check (true);
