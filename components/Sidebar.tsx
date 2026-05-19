"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar as DsSidebar } from "@/components/ui/ds";
import { DevUserSwitcher } from "@/components/DevUserSwitcher";
import { SidebarSettingsMenu } from "@/components/settings/SidebarSettingsMenu";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const DEV_STORAGE_KEY = "designtrace_dev_contributor_id";

/**
 * App shell sidebar: hover-expand rail, settings via footer avatar row only.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState("Auth user");
  const [roleLabel, setRoleLabel] = useState("Contributor");
  const [workspaceLabel, setWorkspaceLabel] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settingsPath = pathname.startsWith("/settings");
  const footerHighlight = settingsPath || settingsOpen;

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const metaName = user.user_metadata?.display_name as string | undefined;
        if (metaName?.trim()) setDisplayName(metaName.trim());

        const activeWorkspaceId = user.user_metadata?.active_workspace_id as string | undefined;
        if (activeWorkspaceId) {
          const { data: workspace } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", activeWorkspaceId)
            .maybeSingle();

          if (workspace?.name?.trim()) {
            setWorkspaceLabel(workspace.name.trim());
          } else if (typeof activeWorkspaceId === "string" && activeWorkspaceId.trim()) {
            setWorkspaceLabel(activeWorkspaceId.trim());
          }
        }
      }

      const contributorId = window.localStorage.getItem(DEV_STORAGE_KEY);
      if (!contributorId) return;

      const { data } = await supabase
        .from("contributors")
        .select("name, role")
        .eq("id", contributorId)
        .maybeSingle();

      const name = data ? String((data as Record<string, unknown>).name ?? "") : "";
      const role = data ? String((data as Record<string, unknown>).role ?? "") : "";
      if (name) setDisplayName(name);
      if (role.trim()) setRoleLabel(role);
    })();
  }, []);

  useEffect(() => {
    setSettingsOpen(false);
  }, [pathname]);

  return (
    <>
      <DsSidebar
        user={{ name: displayName }}
        workspaceLabel={workspaceLabel}
        userActive={footerHighlight}
        settingsMenuOpen={settingsOpen}
        onUserClick={() => setSettingsOpen((prev) => !prev)}
        aboveFooterSlot={
          process.env.NODE_ENV === "development" ? <DevUserSwitcher /> : undefined
        }
        className="shrink-0"
      />
      <SidebarSettingsMenu
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        displayName={displayName}
        roleLabel={roleLabel}
      />
    </>
  );
}
