"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { Sidebar as DsSidebar } from "@/components/ui/ds";
import { DevUserSwitcher } from "@/components/DevUserSwitcher";
import { SidebarSettingsMenu } from "@/components/settings/SidebarSettingsMenu";
import { useActiveWorkspacePermission } from "@/hooks/useWorkspacePermission";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";

const DEV_STORAGE_KEY = "designtrace_dev_contributor_id";

/**
 * App shell sidebar: hover-expand rail, settings via footer avatar row only.
 */
export function Sidebar() {
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("Auth user");
  const [contributorId, setContributorId] = useState<string | null>(null);
  const [roleLabel, setRoleLabel] = useState<string | null>(null);
  const [workspaceLabel, setWorkspaceLabel] = useState<string | null>(null);
  const [workspaceOptions, setWorkspaceOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [activeWorkspaceValue, setActiveWorkspaceValue] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { workspacePermissionLevel } = useActiveWorkspacePermission();

  const settingsPath = pathname.startsWith("/settings");
  const footerHighlight = settingsPath || settingsOpen;
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted.current) return;
      setAuthUser(user ?? null);

      let nextName = user?.email?.split("@")[0] ?? "Auth user";
      let nextRole: string | null = null;
      const activeWorkspaceId = getActiveWorkspaceIdFromUser(user);

      if (user) {
        const metaName = user.user_metadata?.display_name as string | undefined;
        if (metaName?.trim()) nextName = metaName.trim();
      }

      if (!isMounted.current) return;

      setActiveWorkspaceValue(activeWorkspaceId);
      if (user?.id) {
        const { data: membershipRows } = await supabase
          .from("workspace_members")
          .select("workspace_id, workspaces(id, name)")
          .eq("user_id", user.id);
        const mappedMemberships = (membershipRows ?? [])
          .map((row) => {
            const item = row as Record<string, unknown>;
            const workspace = item.workspaces as { id?: string; name?: string } | null;
            const workspaceId = String(item.workspace_id ?? workspace?.id ?? "").trim();
            const label = String(workspace?.name ?? workspaceId).trim();
            if (!workspaceId) return null;
            return { value: workspaceId, label: label || workspaceId };
          })
          .filter((item): item is { value: string; label: string } => item != null);
        if (!isMounted.current) return;
        setWorkspaceOptions(mappedMemberships);
        const activeWorkspaceLabel = mappedMemberships.find(
          (workspace) => workspace.value === activeWorkspaceId,
        )?.label;
        if (activeWorkspaceLabel) {
          setWorkspaceLabel(activeWorkspaceLabel);
        } else if (activeWorkspaceId) {
          const { data: workspace } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", activeWorkspaceId)
            .maybeSingle();
          if (workspace?.name?.trim()) {
            setWorkspaceLabel(workspace.name.trim());
          } else {
            setWorkspaceLabel(activeWorkspaceId);
          }
        } else {
          setWorkspaceLabel(null);
        }
      } else {
        setWorkspaceOptions([]);
        setWorkspaceLabel(null);
      }

      const devContributorId = window.localStorage.getItem(DEV_STORAGE_KEY);
      let avatarContributorId: string | null = null;

      if (user?.id && activeWorkspaceId) {
        const { data: contributorRows } = await supabase
          .from("contributors")
          .select("id, name, role")
          .eq("user_id", user.id)
          .eq("workspace_id", activeWorkspaceId)
          .limit(1);

        const workspaceContributor = contributorRows?.[0] ?? null;
        if (workspaceContributor && typeof workspaceContributor === "object" && "id" in workspaceContributor) {
          avatarContributorId =
            String((workspaceContributor as { id?: string }).id ?? "").trim() || null;
        }

        if (!devContributorId && workspaceContributor) {
          const name = String((workspaceContributor as Record<string, unknown>).name ?? "");
          const role = String((workspaceContributor as Record<string, unknown>).role ?? "");
          if (name.trim()) nextName = name.trim();
          if (role.trim()) nextRole = role.trim();
        }
      }

      if (devContributorId) {
        const { data } = await supabase
          .from("contributors")
          .select("id, name, role")
          .eq("id", devContributorId)
          .maybeSingle();

        const name = data ? String((data as Record<string, unknown>).name ?? "") : "";
        const role = data ? String((data as Record<string, unknown>).role ?? "") : "";
        if (name.trim()) nextName = name.trim();
        if (role.trim()) nextRole = role.trim();
      }

      if (!isMounted.current) return;

      setDisplayName(nextName);
      setRoleLabel(nextRole);
      setContributorId(avatarContributorId);
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
      isMounted.current = false;
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [pathname, supabase]);

  useEffect(() => {
    setSettingsOpen(false);
  }, [pathname]);

  return (
    <>
      <DsSidebar
        user={{
          name: displayName,
          contributorId: contributorId ?? undefined,
        }}
        workspaceLabel={workspaceLabel}
        userActive={footerHighlight}
        settingsMenuOpen={settingsOpen}
        onUserClick={() => setSettingsOpen((prev) => !prev)}
        aboveFooterSlot={<DevUserSwitcher />}
        className="shrink-0"
      />
      <SidebarSettingsMenu
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        contributorId={contributorId}
        displayName={displayName}
        roleLabel={roleLabel ?? ""}
        workspaceOptions={workspaceOptions}
        workspaceValue={activeWorkspaceValue}
        workspacePermissionLevel={workspacePermissionLevel}
      />
    </>
  );
}
