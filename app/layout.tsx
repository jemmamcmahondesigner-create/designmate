import "./globals.css";
import type { Metadata } from "next";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "DesignTrace",
  description: "Multi-tenant B2B SaaS starter",
  icons: {
    icon: "/assets/logo/mark-collapsed.svg",
  },
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <body className="h-full overflow-hidden">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

