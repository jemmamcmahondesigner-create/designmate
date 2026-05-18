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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settingsPath = pathname.startsWith("/settings");
  const footerHighlight = settingsPath || settingsOpen;

  useEffect(() => {
    const contributorId = window.localStorage.getItem(DEV_STORAGE_KEY);
    if (!contributorId) return;
    const supabase = createSupabaseBrowserClient();
    void supabase
      .from("contributors")
      .select("name, role")
      .eq("id", contributorId)
      .maybeSingle()
      .then(({ data }) => {
        const name = data ? String((data as Record<string, unknown>).name ?? "") : "";
        const role = data ? String((data as Record<string, unknown>).role ?? "") : "";
        if (name) setDisplayName(name);
        if (role.trim()) setRoleLabel(role);
      });
  }, []);

  useEffect(() => {
    setSettingsOpen(false);
  }, [pathname]);

  return (
    <>
      <DsSidebar
        user={{ name: displayName }}
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
