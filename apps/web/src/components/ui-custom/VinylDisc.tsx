
const VINYL_GROOVE_RADII = [38, 46, 54, 61, 67, 72, 76, 79, 82, 84, 86, 88, 90, 92, 94, 96];

export function VinylDisc() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden>
      {/* Base */}
      <circle cx="100" cy="100" r="100" fill="var(--vinyl-base)" />

      {/* Groove rings */}
      {VINYL_GROOVE_RADII.map((r) => (
        <circle
          key={r}
          cx="100" cy="100" r={r}
          fill="none"
          stroke="var(--vinyl-groove)"
          strokeWidth="0.7"
        />
      ))}

      {/* Subtle sheen arc for 3-D depth */}
      <path
        d="M 42 55 A 68 68 0 0 1 138 42"
        fill="none"
        stroke="var(--vinyl-sheen)"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Label circle */}
      <circle cx="100" cy="100" r="32" fill="var(--vinyl-label)" />
      <circle cx="100" cy="100" r="30" fill="none" stroke="var(--vinyl-label-ring)" strokeWidth="1" />

      {/* Center spindle hole */}
      <circle cx="100" cy="100" r="3.5" fill="var(--vinyl-hole)" />
    </svg>
  );
}

export default VinylDisc;