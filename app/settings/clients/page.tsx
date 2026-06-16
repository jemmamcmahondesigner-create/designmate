import { ClientsSettingsPage, type ClientRow } from "@/components/settings/ClientsSettingsPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { getWorkspacePermissionLevelForCurrentUser } from "@/lib/workspace/settingsAccess";

export const dynamic = "force-dynamic";

type ClientRowDb = {
  id: string;
  name?: string | null;
  industry?: string | null;
  website?: string | null;
  projects?: { count: number }[] | null;
};

function projectCountFromRow(row: ClientRowDb): number {
  const aggregate = row.projects?.[0];
  return typeof aggregate?.count === "number" ? aggregate.count : 0;
}

export default async function SettingsClientsPage() {
  const permissionLevel = await getWorkspacePermissionLevelForCurrentUser();
  const isReadOnly = permissionLevel === "reviewer";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const activeWorkspaceId = getActiveWorkspaceIdFromUser(user);

  let clientsQuery = supabase
    .from("clients")
    .select("id, name, industry, website, projects(count)")
    .order("name", { ascending: true });

  if (activeWorkspaceId) {
    clientsQuery = clientsQuery.eq("workspace_id", activeWorkspaceId);
  } else {
    clientsQuery = clientsQuery.eq("workspace_id", "00000000-0000-0000-0000-000000000000");
  }

  const { data: clientRows, error: clientsError } = await clientsQuery;

  if (clientsError) {
    console.error("Clients fetch error:", clientsError);
  }

  const initialClients: ClientRow[] = (clientRows ?? []).map((row) => {
    const r = row as ClientRowDb;
    const id = String(r.id ?? "");
    const name = String(r.name ?? "");
    return {
      id,
      name,
      industry: r.industry == null ? null : String(r.industry),
      website: r.website == null ? null : String(r.website),
      projectCount: projectCountFromRow(r),
    };
  });

  return (
    <ClientsSettingsPage
      initialClients={initialClients}
      readOnly={isReadOnly}
      activeWorkspaceId={activeWorkspaceId}
    />
  );
}
