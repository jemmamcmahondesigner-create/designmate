import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DesignMate",
  description: "Multi-tenant B2B SaaS starter"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

