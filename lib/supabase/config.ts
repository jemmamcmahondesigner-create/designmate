/**
 * Supabase client env (Server Components, Route Handlers, middleware).
 *
 * Use **static** `process.env.NEXT_PUBLIC_*` access only. Dynamic lookups like
 * `process.env[name]` are not inlined into the browser bundle and break client code.
 *
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the legacy name from JWT-based projects.
 * On the hosted platform you may use either:
 * - the new **publishable** key (`sb_publishable_...`), or
 * - the legacy **anon** JWT
 *
 * Both are low-privilege and are passed as the `apikey` header; Auth + RLS behave the same.
 * Do not put **secret** (`sb_secret_...`) or **service_role** keys in `NEXT_PUBLIC_*` vars.
 */
export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  return url;
}

/** Publishable key or legacy anon JWT — same usage for supabase-js / @supabase/ssr. */
export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return key;
}
