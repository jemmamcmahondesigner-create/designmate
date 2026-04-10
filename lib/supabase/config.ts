/**
 * Supabase client env (browser, Server Components, Route Handlers, middleware).
 *
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the legacy name from JWT-based projects.
 * On the hosted platform you may use either:
 * - the new **publishable** key (`sb_publishable_...`), or
 * - the legacy **anon** JWT
 *
 * Both are low-privilege and are passed as the `apikey` header; Auth + RLS behave the same.
 * Do not put **secret** (`sb_secret_...`) or **service_role** keys in `NEXT_PUBLIC_*` vars.
 */
function requiredPublicEnv(name: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === null) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  const value = raw.trim();
  if (value === "") {
    throw new Error(`Environment variable ${name} is set but empty (check .env.local)`);
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL");
}

/** Publishable key or legacy anon JWT — same usage for supabase-js / @supabase/ssr. */
export function getSupabaseAnonKey(): string {
  return requiredPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}
