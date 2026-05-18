import { AllReviewsShell } from "@/components/reviews/AllReviewsShell";
import { NewReviewDrawerProvider } from "@/components/NewReviewDrawerProvider";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ReviewsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name")
    .order("name", { ascending: true });

  const allProjects = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return { id: String(r.id ?? ""), name: String(r.name ?? "") };
  });

  return (
    <NewReviewDrawerProvider allProjects={allProjects}>
      <AllReviewsShell>{children}</AllReviewsShell>
    </NewReviewDrawerProvider>
  );
}
