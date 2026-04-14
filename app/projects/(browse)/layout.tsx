import { ProjectsPageHeader } from "@/components/ProjectsPageHeader";
import { Sidebar } from "@/components/Sidebar";

export default function ProjectsBrowseLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Sidebar />
      <div
        className="flex min-h-screen min-w-0 flex-1 flex-col"
        style={{
          display: "flex",
          minHeight: "100vh",
          minWidth: 0,
          flex: 1,
          overflow: "hidden",
          flexDirection: "column",
          backgroundColor: "#faf8f6"
        }}
      >
        <ProjectsPageHeader />
        <div
          className="min-h-0 flex-1"
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            minWidth: 0,
            display: "flex",
            flexDirection: "column"
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
