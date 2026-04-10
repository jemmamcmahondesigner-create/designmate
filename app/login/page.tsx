import { Container } from "@/components/container";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  return (
    <main className="py-16">
      <Container>
        <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-2 text-zinc-600">
          Supabase auth wiring is in place. Add your preferred login UI (magic
          link, OAuth, SSO) here.
        </p>
        <pre className="mt-6 rounded-lg border bg-zinc-50 p-4 text-xs">
          {JSON.stringify(
            { hasSession: Boolean(session), userId: session?.user?.id ?? null },
            null,
            2
          )}
        </pre>
      </Container>
    </main>
  );
}

