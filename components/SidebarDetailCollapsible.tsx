"use client";

import { Sidebar } from "@/components/Sidebar";

type SidebarDetailCollapsibleProps = {
  projectName: string;
  clientName: string;
  recentProjects: {
    id: string;
    name: string;
    client: string | null;
  }[];
};

/**
 * Project detail shell uses the same app Sidebar as other routes.
 * Project list props are retained for callers; navigation is global.
 */
export function SidebarDetailCollapsible(_props: SidebarDetailCollapsibleProps) {
  return <Sidebar />;
}
