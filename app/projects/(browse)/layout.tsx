import { ProjectsBrowseShell } from "@/components/projects/ProjectsBrowseShell";

export default function ProjectsBrowseLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ProjectsBrowseShell>{children}</ProjectsBrowseShell>;
}
