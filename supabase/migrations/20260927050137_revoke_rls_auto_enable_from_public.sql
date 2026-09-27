-- anon/authenticated were already revoked, but they inherit EXECUTE via the
-- default PUBLIC grant. Event triggers do not check EXECUTE, so the trigger
-- keeps firing; this only removes the /rest/v1/rpc/rls_auto_enable surface.
revoke execute on function public.rls_auto_enable() from public;
