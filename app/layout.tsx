import "./globals.css";
import type { Metadata } from "next";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "DesignTrace",
  description: "Multi-tenant B2B SaaS starter"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

