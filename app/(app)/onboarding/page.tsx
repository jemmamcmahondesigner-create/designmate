import { redirect } from "next/navigation";
import { AuthMark } from "@/components/auth/AuthMark";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        boxSizing: "border-box",
        backgroundColor: "var(--surface-page, #faf8f6)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
          textAlign: "center",
        }}
      >
        <AuthMark />
        <h2
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: "-0.36px",
            color: "var(--text-secondary, #6b5e55)",
          }}
        >
          Setting up your workspace…
        </h2>
      </div>
    </main>
  );
}
