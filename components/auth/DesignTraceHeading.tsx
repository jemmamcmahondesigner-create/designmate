export type DesignTraceHeadingProps = {
  /** Text before “Trace”, e.g. “Sign in to Design” or “Welcome to Design”. */
  prefix: string;
  centered?: boolean;
  as?: "h1" | "h2";
};

export function DesignTraceHeading({
  prefix,
  centered = false,
  as: Tag = "h1",
}: DesignTraceHeadingProps) {
  return (
    <Tag
      className="m-0"
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: centered ? "center" : "flex-start",
        alignItems: "baseline",
        gap: 0,
        lineHeight: 1.2,
      }}
    >
      <span
        style={{
          fontSize: Tag === "h1" ? 32 : 24,
          fontWeight: 800,
          color: "var(--text-heading, #6b1e2e)",
          letterSpacing: Tag === "h1" ? "-0.96px" : "-0.36px",
        }}
      >
        {prefix}
      </span>
      <span
        style={{
          fontSize: Tag === "h1" ? 32 : 24,
          fontWeight: 300,
          color: "#a0384f",
          letterSpacing: Tag === "h1" ? "-0.96px" : "-0.36px",
        }}
      >
        Trace
      </span>
    </Tag>
  );
}
