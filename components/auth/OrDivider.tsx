import { Divider } from "@/components/ui/ds";

export function OrDivider() {
  return (
    <div
      className="flex w-full items-center"
      style={{ gap: 16 }}
      role="separator"
      aria-label="Or"
    >
      <Divider className="min-w-0 flex-1" />
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--text-tertiary, #998c82)",
          flexShrink: 0,
        }}
      >
        OR
      </span>
      <Divider className="min-w-0 flex-1" />
    </div>
  );
}
