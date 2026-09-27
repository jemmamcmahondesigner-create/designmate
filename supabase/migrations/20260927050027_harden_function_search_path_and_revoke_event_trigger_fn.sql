-- Pin search_path on the three functions flagged by the security advisor.
-- All three bodies are fully schema-qualified; keeping `public` on the path
-- means nothing that resolves today can fail to resolve.
alter function public.set_updated_at() set search_path = pg_catalog, public;
alter function public.reviews_set_completed_at() set search_path = pg_catalog, public;
alter function public.get_my_workspace_ids() set search_path = pg_catalog, public;

-- rls_auto_enable() is an event-trigger function. It cannot do anything useful
-- when called over RPC (it errors), so remove it from the client-callable surface.
revoke execute on function public.rls_auto_enable() from anon, authenticated;
