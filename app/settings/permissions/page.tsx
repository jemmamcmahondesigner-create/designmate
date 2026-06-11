import { PermissionsSettingsPage } from "@/components/settings/PermissionsSettingsPage";
import { getWorkspacePermissionLevelForCurrentUser } from "@/lib/workspace/settingsAccess";

export default async function SettingsPermissionsPage() {
  const permissionLevel = await getWorkspacePermissionLevelForCurrentUser();
  const isReadOnly = permissionLevel === "reviewer";

  return <PermissionsSettingsPage readOnly={isReadOnly} />;
}
