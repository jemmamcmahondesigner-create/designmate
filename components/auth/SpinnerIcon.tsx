export type SpinnerIconProps = {
  size?: number;
  className?: string;
};

/** Accessible loading spinner (SVG + CSS animate-spin). */
export function SpinnerIcon({ size = 18, className }: SpinnerIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="14 42"
      />
    </svg>
  );
}
