
const VINYL_GROOVE_RADII = [38, 46, 54, 61, 67, 72, 76, 79, 82, 84, 86, 88, 90, 92, 94, 96];

export function VinylDisc() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden>
      {/* Base */}
      <circle cx="100" cy="100" r="100" fill="#08080f" />

      {/* Groove rings */}
      {VINYL_GROOVE_RADII.map((r) => (
        <circle
          key={r}
          cx="100" cy="100" r={r}
          fill="none"
          stroke="rgba(255,255,255,0.045)"
          strokeWidth="0.7"
        />
      ))}

      {/* Subtle sheen arc for 3-D depth */}
      <path
        d="M 42 55 A 68 68 0 0 1 138 42"
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="10"
        strokeLinecap="round"
      />

      {/* Label circle */}
      <circle cx="100" cy="100" r="32" fill="#1e1b4b" />
      <circle cx="100" cy="100" r="30" fill="none" stroke="rgba(99,102,241,0.35)" strokeWidth="1" />

      

      {/* Center spindle hole */}
      <circle cx="100" cy="100" r="3.5" fill="#030712" />
    </svg>
  );
}

export function VinylDiscPlaceholder() {
  return (
    <div className="w-full h-full rounded-full bg-gradient-to-tr from-slate-700/60 to-slate-900/60 animate-pulse" />
  );
}

export default VinylDisc;