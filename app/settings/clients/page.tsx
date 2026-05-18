import { ClientsSettingsPage, type ClientRow } from "@/components/settings/ClientsSettingsPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsClientsPage() {
  const supabase = await createSupabaseServerClient();

  const { data: clientRows, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, industry, website")
    .order("name", { ascending: true });

  if (clientsError) {
    console.error("Clients fetch error:", clientsError);
  }

  const { data: projectRows, error: projectsError } = await supabase.from("projects").select("client");

  if (projectsError) {
    console.error("Clients page projects fetch error:", projectsError);
  }

  const counts = new Map<string, number>();
  for (const p of projectRows ?? []) {
    const rec = p as { client?: string | null };
    const c = rec.client;
    if (c == null || String(c).trim() === "") continue;
    const key = String(c);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const initialClients: ClientRow[] = (clientRows ?? []).map((row) => {
    const r = row as { id: string; name?: string | null; industry?: string | null; website?: string | null };
    const name = String(r.name ?? "");
    return {
      id: String(r.id ?? ""),
      name,
      industry: r.industry == null ? null : String(r.industry),
      website: r.website == null ? null : String(r.website),
      projectCount: counts.get(name) ?? 0,
    };
  });

  return <ClientsSettingsPage initialClients={initialClients} />;
}
