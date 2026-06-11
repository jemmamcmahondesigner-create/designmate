import { Container } from "@/components/container";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <main className="py-16">
      <Container>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-zinc-600">
          This is a placeholder. In a multi-tenant setup, you’ll typically scope
          pages by tenant (e.g. <code>/t/[tenantSlug]/...</code>) and enforce RLS
          in Supabase.
        </p>
        <pre className="mt-6 rounded-lg border bg-zinc-50 p-4 text-xs">
          {JSON.stringify({ userId: user?.id ?? null }, null, 2)}
        </pre>
      </Container>
    </main>
  );
}

