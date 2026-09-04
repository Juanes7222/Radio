/**
 * Motion system — single orchestrated moment per screen.
 * All durations use reanimated worklets; spring is default for interactive,
 * timing for ambient.
 */

export const Durations = {
  instant: 120,
  fast: 180,
  normal: 260,
  slow: 380,
  ambient: 2800,
} as const;

export const Easings = {
  // expo-standard bezier
  default: [0.25, 0.1, 0.25, 1] as const,
  enter: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  spring: [0.34, 1.56, 0.64, 1] as const,
} as const;

export const Spring = {
  gentle: { damping: 18, stiffness: 180, mass: 0.8 },
  snappy: { damping: 14, stiffness: 220, mass: 0.7 },
  bouncy: { damping: 10, stiffness: 200, mass: 0.9 },
} as const;

export const Motion = {
  // Vinyl / Dial rotation
  vinylRotationMs: 9000,
  haloPulseMs: 2800,
  // Entry choreography
  entryStaggerMs: 40,
} as const;
