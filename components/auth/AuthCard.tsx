import type { ReactNode } from "react";

export type AuthCardProps = {
  children: ReactNode;
  centered?: boolean;
};

export function AuthCard({ children, centered = false }: AuthCardProps) {
  return (
    <div className={`auth-card${centered ? " auth-card-centered" : ""}`}>
      {children}
    </div>
  );
}
