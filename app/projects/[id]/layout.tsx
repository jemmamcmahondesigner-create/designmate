export default function ProjectDetailLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
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
  );
}
