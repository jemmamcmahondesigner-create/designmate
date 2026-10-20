-- Postgres-backed rate limiter for Vercel serverless routes.
-- Keys are sha256-hashed before storage so raw IPs and emails never land in the table.

create table if not exists public.rate_limit_hits (
  key_hash text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key_hash, window_start)
);

alter table public.rate_limit_hits enable row level security;

revoke all on table public.rate_limit_hits from public, anon, authenticated;

create or replace function public.check_rate_limit(
  p_key text,
  p_max int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_window_seconds int;
  v_window_start timestamptz;
  v_count int;
begin
  v_window_seconds := greatest(coalesce(p_window_seconds, 0), 1);
  v_hash := encode(extensions.digest(convert_to(coalesce(p_key, ''), 'UTF8'), 'sha256'), 'hex');
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / v_window_seconds) * v_window_seconds
  );

  insert into public.rate_limit_hits as hits (key_hash, window_start, count)
  values (v_hash, v_window_start, 1)
  on conflict (key_hash, window_start)
  do update set count = hits.count + 1
  returning hits.count into v_count;

  delete from public.rate_limit_hits
  where window_start < clock_timestamp() - interval '1 day';

  return v_count <= coalesce(p_max, 0);
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
