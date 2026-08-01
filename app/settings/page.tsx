import {
  IntegrationsSettingsPage,
  type FigmaConnectionInfo,
} from "@/components/settings/IntegrationsSettingsPage";
import { createServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { getWorkspaceMembershipForCurrentUser } from "@/lib/workspace/resolveWorkspaceMembership";

type SettingsPageProps = {
  searchParams?: { figma?: string };
};

export default async function SettingsIntegrationsPage({
  searchParams,
}: SettingsPageProps) {
  const membership = await getWorkspaceMembershipForCurrentUser();
  const isAdmin = membership.workspacePermissionLevel === "admin";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspaceId =
    membership.workspaceId ?? getActiveWorkspaceIdFromUser(user);

  let figmaConnection: FigmaConnectionInfo = null;

  if (workspaceId) {
    const service = createServiceClient();
    const { data: tokenRow } = await service
      .from("workspace_figma_tokens")
      .select("connected_by, created_at")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (tokenRow) {
      const connectedBy = String(
        (tokenRow as { connected_by?: string | null }).connected_by ?? "",
      ).trim();
      const createdAt = String(
        (tokenRow as { created_at?: string | null }).created_at ?? "",
      ).trim();

      let connectedByName = "Unknown";
      if (connectedBy) {
        const { data: contributor } = await service
          .from("contributors")
          .select("name")
          .eq("workspace_id", workspaceId)
          .eq("user_id", connectedBy)
          .maybeSingle();

        const name = String(
          (contributor as { name?: string | null } | null)?.name ?? "",
        ).trim();
        if (name) connectedByName = name;
      }

      figmaConnection = {
        connectedByName,
        connectedAt: createdAt || new Date().toISOString(),
      };
    }
  }

  const rawFigma = searchParams?.figma?.trim();
  const figmaStatus =
    rawFigma === "connected" || rawFigma === "error" ? rawFigma : null;

  return (
    <IntegrationsSettingsPage
      isAdmin={isAdmin}
      figmaConnection={figmaConnection}
      figmaStatus={figmaStatus}
    />
  );
}
