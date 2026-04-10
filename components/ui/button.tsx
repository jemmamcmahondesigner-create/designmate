import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  asChild?: boolean;
  children: React.ReactNode;
};

function classNames(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

const base =
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-white";

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-800",
  secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
  ghost: "bg-transparent text-zinc-900 hover:bg-zinc-100"
};

export function Button({
  variant = "primary",
  className,
  asChild,
  children,
  ...props
}: ButtonProps) {
  const classes = classNames(base, variants[variant], "h-10 px-4", className);

  if (asChild) {
    return (
      <span className={classes} role="presentation">
        {children}
      </span>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

