export type DesignTraceNameProps = {
  textColor?: string;
};

export function DesignTraceName({ textColor = "inherit" }: DesignTraceNameProps) {
  return (
    <>
      <span style={{ fontWeight: 800, color: textColor }}>Design</span>
      <span style={{ fontWeight: 300, color: "#a0384f" }}>Trace</span>
    </>
  );
}