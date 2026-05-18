import Link from "next/link";
import type { ComponentProps } from "react";

export type AuthTextLinkProps = ComponentProps<typeof Link>;

export function AuthTextLink({ className, children, ...rest }: AuthTextLinkProps) {
  return (
    <Link
      className={["auth-text-link", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </Link>
  );
}
