export default function ProjectDetailLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
      style={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        flex: 1,
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
