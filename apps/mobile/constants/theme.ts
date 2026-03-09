export const Colors = {
  background: '#0c0c1e',
  surface: 'rgba(255,255,255,0.08)',
  surfaceElevated: 'rgba(255,255,255,0.13)',
  border: 'rgba(255,255,255,0.14)',

  accent: '#6366f1',
  accentMuted: 'rgba(99,102,241,0.22)',
  accentGlow: 'rgba(99,102,241,0.40)',

  text: '#f9fafb',
  textMuted: 'rgba(255,255,255,0.70)',
  textFaint: 'rgba(255,255,255,0.42)',

  danger: '#ef4444',
  dangerMuted: 'rgba(239,68,68,0.18)',
  warning: '#f59e0b',
  warningMuted: 'rgba(245,158,11,0.16)',
  success: '#22c55e',
} as const;

export const Radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const Typography = {
  screenTitle: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  songTitle:   { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.4 },
  artistName:  { fontSize: 16, fontWeight: '500' as const },
  albumName:   { fontSize: 13, fontWeight: '400' as const },
  label:       { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.5 },
  body:        { fontSize: 14, fontWeight: '400' as const },
  caption:     { fontSize: 12, fontWeight: '400' as const },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;
