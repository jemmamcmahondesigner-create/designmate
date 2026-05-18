import "@/components/auth/auth.css";
import { AuthBodyShell } from "@/components/auth/AuthBodyShell";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AuthBodyShell>{children}</AuthBodyShell>;
}
