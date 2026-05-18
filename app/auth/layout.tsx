import "@/components/auth/auth.css";
import { AuthBodyShell } from "@/components/auth/AuthBodyShell";

export default function AuthRouteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AuthBodyShell>{children}</AuthBodyShell>;
}
