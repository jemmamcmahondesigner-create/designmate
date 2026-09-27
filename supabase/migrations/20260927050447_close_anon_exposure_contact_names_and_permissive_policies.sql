-- ===========================================================================
-- 1. contact_names: a name-lookup view must never be writable, and must never
--    be readable without signing in. Proved exploitable: `anon` read 94 names
--    across every workspace and rewrote a contributor row through this view.
--    Left SECURITY DEFINER for now (converting to security_invoker changes
--    which rows resolve, so that needs a codebase check first).
-- ===========================================================================
revoke all on public.contact_names from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.contact_names from authenticated;
grant select on public.contact_names to authenticated;

-- ===========================================================================
-- 2. The four leftover "for now" policies were granted to PUBLIC, which
--    includes `anon` — i.e. anyone holding the publishable key that ships in
--    the browser bundle. Narrowing them to `authenticated` is a strict
--    reduction: every real user is `authenticated`, and server-side code runs
--    as `service_role`, which bypasses RLS. Their permissive true/true
--    expressions still need workspace scoping — separate, needs app knowledge.
-- ===========================================================================
alter policy "Allow all for now"    on public.access_requests to authenticated;
alter policy "Allow all for now"    on public.sources         to authenticated;
alter policy "Allow all for now"    on public.review_sources  to authenticated;
alter policy "Allow update for now" on public.contributors    to authenticated;
