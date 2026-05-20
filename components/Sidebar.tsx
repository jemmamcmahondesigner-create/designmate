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
  const [roleLabel, setRoleLabel] = useState<string | null>(null);
  const [workspaceLabel, setWorkspaceLabel] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settingsPath = pathname.startsWith("/settings");
  const footerHighlight = settingsPath || settingsOpen;

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let nextName = user?.email?.split("@")[0] ?? "Auth user";
      let nextRole: string | null = null;

      const activeWorkspaceId = user?.user_metadata?.active_workspace_id as
        | string
        | undefined;

      if (user) {
        const metaName = user.user_metadata?.display_name as string | undefined;
        if (metaName?.trim()) nextName = metaName.trim();
      }

      if (activeWorkspaceId) {
        const { data: workspace } = await supabase
          .from("workspaces")
          .select("name")
          .eq("id", activeWorkspaceId)
          .maybeSingle();

        if (workspace?.name?.trim()) {
          setWorkspaceLabel(workspace.name.trim());
        } else if (activeWorkspaceId.trim()) {
          setWorkspaceLabel(activeWorkspaceId.trim());
        } else {
          setWorkspaceLabel(null);
        }
      } else {
        setWorkspaceLabel(null);
      }

      const contributorId = window.localStorage.getItem(DEV_STORAGE_KEY);

      if (contributorId) {
        const { data } = await supabase
          .from("contributors")
          .select("name, role")
          .eq("id", contributorId)
          .maybeSingle();

        const name = data ? String((data as Record<string, unknown>).name ?? "") : "";
        const role = data ? String((data as Record<string, unknown>).role ?? "") : "";
        if (name.trim()) nextName = name.trim();
        if (role.trim()) nextRole = role.trim();
      } else if (user?.id) {
        let contributorQuery = supabase
          .from("contributors")
          .select("name, role")
          .eq("user_id", user.id);

        if (activeWorkspaceId) {
          contributorQuery = contributorQuery.eq("workspace_id", activeWorkspaceId);
        }

        const { data } = await contributorQuery.maybeSingle();
        const name = data ? String((data as Record<string, unknown>).name ?? "") : "";
        const role = data ? String((data as Record<string, unknown>).role ?? "") : "";
        if (name.trim()) nextName = name.trim();
        if (role.trim()) nextRole = role.trim();
      }

      setDisplayName(nextName);
      setRoleLabel(nextRole);
    };

    void loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadProfile();
    });

    const onStorage = (event: StorageEvent) => {
      if (event.key === DEV_STORAGE_KEY || event.key === null) {
        void loadProfile();
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
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
        roleLabel={roleLabel ?? ""}
      />
    </>
  );
}
