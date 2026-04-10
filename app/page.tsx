import { Container } from "@/components/container";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="py-16">
      <Container>
        <div className="space-y-4">
          <h1 className="text-balance text-3xl font-semibold tracking-tight">
            DesignMate
          </h1>
          <p className="max-w-prose text-pretty text-zinc-600">
            Next.js 14 + Tailwind + Supabase starter with a clean folder
            structure for a multi-tenant B2B SaaS.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href="/login">Log in</a>
            </Button>
            <Button asChild variant="secondary">
              <a href="/dashboard">Dashboard</a>
            </Button>
          </div>
        </div>
      </Container>
    </main>
  );
}

