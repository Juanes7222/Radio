import { motion } from 'framer-motion';
import { Music } from 'lucide-react';

interface VinylDiscProps {
  artworkUrl: string | null | undefined;
  isPlaying: boolean;
  size?: number;
}

const GROOVE_COUNT = 18;

export function VinylDisc({ artworkUrl, isPlaying, size = 56 }: VinylDiscProps) {
  const radius = size / 2;
  const labelSize = size * 0.4;
  const labelRadius = labelSize / 2;
  const holeSize = size * 0.055;
  const holeRadius = holeSize / 2;

  const grooveOuterFraction = 0.494;
  const grooveInnerFraction = (labelRadius + size * 0.03) / radius;
  const grooveStep = (grooveOuterFraction - grooveInnerFraction) / (GROOVE_COUNT - 1);

  return (
    <motion.div
      style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}
      animate={{ rotate: isPlaying ? 360 : 0 }}
      transition={
        isPlaying
          ? { duration: 8, repeat: Infinity, ease: 'linear' }
          : { duration: 0.4, ease: 'easeOut' }
      }
    >
      {/* SVG: vinyl body + grooves */}
      <svg
        width={size}
        height={size}
        style={{ position: 'absolute', inset: 0 }}
      >
        <defs>
          <radialGradient id="vd-body" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#1e1a2e" />
            <stop offset="40%"  stopColor="#0e0c18" />
            <stop offset="75%"  stopColor="#121020" />
            <stop offset="100%" stopColor="#080810" />
          </radialGradient>
          <linearGradient id="vd-gloss" x1="20%" y1="10%" x2="80%" y2="90%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="45%"  stopColor="#ffffff" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <circle cx={radius} cy={radius} r={radius} fill="url(#vd-body)" />
        <circle
          cx={radius} cy={radius} r={radius - 2}
          fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3}
        />

        {Array.from({ length: GROOVE_COUNT }, (_, i) => {
          const fraction = grooveOuterFraction - i * grooveStep;
          const r = fraction * radius;
          const opacity = i % 2 === 0 ? 0.22 : 0.08;
          return (
            <circle
              key={i}
              cx={radius} cy={radius} r={r}
              fill="none"
              stroke={`rgba(255,255,255,${opacity})`}
              strokeWidth={1}
            />
          );
        })}

        <circle cx={radius} cy={radius} r={radius} fill="url(#vd-gloss)" />
      </svg>

      {/* Label (artwork or fallback icon) */}
      <div
        style={{
          position: 'absolute',
          top: radius - labelRadius,
          left: radius - labelRadius,
          width: labelSize,
          height: labelSize,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.18)',
        }}
      >
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: '#16102a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Music
              style={{
                width: labelSize * 0.38,
                height: labelSize * 0.38,
                color: 'rgba(129,140,248,0.85)',
              }}
            />
          </div>
        )}
        {/* Label edge vignette */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Spindle hole */}
      <div
        style={{
          position: 'absolute',
          top: radius - holeRadius,
          left: radius - holeRadius,
          width: holeSize,
          height: holeSize,
          borderRadius: '50%',
          background: '#06060e',
          border: '1.5px solid rgba(255,255,255,0.4)',
        }}
      />
    </motion.div>
  );
}
