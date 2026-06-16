type ArtifactCountIndicatorProps = {
  count: number;
  max?: number;
};

export function ArtifactCountIndicator({
  count,
  max = 10,
}: ArtifactCountIndicatorProps) {
  if (count <= 0) return null;

  const atLimit = count >= max;
  const warning = count >= max - 2 && !atLimit;
  const color = atLimit ? "#8b2020" : warning ? "#7a5500" : "#998c82";
  const label = atLimit
    ? `${max}/${max} — limit reached`
    : `${count}/${max} artifacts`;

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 400,
        lineHeight: 1.5,
        color,
      }}
    >
      {label}
    </span>
  );
}
