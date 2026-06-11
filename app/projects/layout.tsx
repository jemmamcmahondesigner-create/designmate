import { NewReviewDrawerProvider } from "@/components/NewReviewDrawerProvider";
import { CreateProjectModalProvider } from "@/components/projects/CreateProjectModalProvider";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ProjectsLayout({
  children
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
      <CreateProjectModalProvider>
        <div
          className="flex h-full min-h-0 min-w-0 flex-1"
          style={{
            display: "flex",
            height: "100%",
            minHeight: 0,
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            flex: 1,
            overflow: "hidden"
          }}
        >
          {children}
        </div>
      </CreateProjectModalProvider>
    </NewReviewDrawerProvider>
  );
}
