import { AllReviewsShell } from "@/components/reviews/AllReviewsShell";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";

export default function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AllReviewsShell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <SettingsPageHeader />
        <div
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflowX: "hidden",
            overflowY: "auto",
            paddingLeft: 32,
            paddingRight: 32,
            paddingTop: 16,
          }}
        >
          {children}
        </div>
      </div>
    </AllReviewsShell>
  );
}
