/**
 * Design tokens — La Voz de la Verdad (Mobile Redesign 2026)
 * Palette anclada al objeto: transistor bakelita, dial ámbar, papel biblia, noche Caribe.
 * Mantiene aliases legacy (accent, accentLight…) para migración incremental.
 */

export const Colors = {
  // ——— Core ———
  ink: '#080A1E',
  inkElevated: '#131636',
  inkSoft: '#1A1440',
  background: '#080A1E',
  backgroundAlt: '#0A0C24',
  backgroundElevated: '#131636',
  gradientDeep: '#1A1440',
  paper: '#FFF6E5',
  paperMuted: '#F5E6C8',

  // ——— Surfaces (glass system sobre ink) ———
  surface: 'rgba(255,255,255,0.06)',
  surfaceDim: 'rgba(255,255,255,0.035)',
  surfaceFaint: 'rgba(255,255,255,0.05)',
  surfaceSoft: 'rgba(255,255,255,0.06)',
  surfaceBorder: 'rgba(255,255,255,0.07)',
  surfaceElevated: 'rgba(255,255,255,0.10)',
  surfaceGlass: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.08)',
  borderGlass: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',

  // ——— Signal (ámbar dial) — primario absoluto ———
  signal: '#FFB547',
  signalLight: '#FFC46E',
  signalMuted: 'rgba(255,181,71,0.14)',
  signalGlow: 'rgba(255,181,71,0.32)',
  signalSoft: 'rgba(255,181,71,0.08)',
  signalFaint: 'rgba(255,181,71,0.06)',

  // ——— Legacy aliases (migración) ———
  accent: '#FFB547',
  accentLight: '#FFC46E',
  accentMuted: 'rgba(255,181,71,0.14)',
  accentGlow: 'rgba(255,181,71,0.32)',

  // ——— Semantic ———
  tally: '#FF3B3A',
  tallyMuted: 'rgba(255,59,58,0.14)',
  tallyGlow: 'rgba(255,59,58,0.28)',
  danger: '#FF3B3A',
  dangerMuted: 'rgba(255,59,58,0.14)',
  warning: '#FFB547',
  warningMuted: 'rgba(255,181,71,0.14)',
  success: '#22c55e',
  successMuted: 'rgba(34,197,94,0.14)',

  // ——— Text ———
  text: '#F8F7FF',
  textBright: '#FFFFFF',
  textSoft: '#F1F1FF',
  textMuted: 'rgba(248,247,255,0.68)',
  textFaint: 'rgba(248,247,255,0.52)',
  textAlt: '#9CA3AF',
  textAltFaint: '#6B7280',
  textOnSignal: '#1A0F00',
  textOnPaper: '#1C1400',

  // ——— Legacy surfaces translation ———
  cian: '#FFB547',
  cianMuted: 'rgba(255,181,71,0.14)',
} as const;

export const Radii = {
  xs: 8,
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  '3xl': 64,
} as const;

export const Fonts = {
  displayBold: 'Fraunces_700Bold',
  displaySemi: 'Fraunces_600SemiBold',
  bodyRegular: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemi: 'InstrumentSans_600SemiBold',
  bodyBold: 'InstrumentSans_700Bold',
  mono: 'IBMPlexMono_500Medium',
} as const;

export const Typography = {
  display: { fontFamily: Fonts.displayBold, fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.8, lineHeight: 32 },
  screenTitle: { fontFamily: Fonts.bodyBold, fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.4, lineHeight: 26 },
  sectionTitle: { fontFamily: Fonts.bodySemi, fontSize: 14, fontWeight: '700' as const, letterSpacing: -0.2, lineHeight: 18 },
  songTitle: { fontFamily: Fonts.displaySemi, fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 26 },
  artistName: { fontFamily: Fonts.bodyMedium, fontSize: 15, fontWeight: '500' as const, letterSpacing: -0.1, lineHeight: 20 },
  albumName: { fontFamily: Fonts.bodyRegular, fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  body: { fontFamily: Fonts.bodyRegular, fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodyStrong: { fontFamily: Fonts.bodySemi, fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  label: { fontFamily: Fonts.bodyBold, fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.08 * 11, lineHeight: 14, textTransform: 'uppercase' as const },
  eyebrow: { fontFamily: Fonts.bodyBold, fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.4, lineHeight: 14, textTransform: 'uppercase' as const },
  caption: { fontFamily: Fonts.bodyRegular, fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  captionStrong: { fontFamily: Fonts.bodySemi, fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  mono: { fontFamily: Fonts.mono, fontSize: 11, fontWeight: '500' as const, letterSpacing: 0.04 * 11, lineHeight: 14, fontVariant: ['tabular-nums'] as unknown as string },
  monoLarge: { fontFamily: Fonts.mono, fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.02 * 13, lineHeight: 16, fontVariant: ['tabular-nums'] as unknown as string },
} as const;

export const Shadows = {
  signal: {
    shadowColor: '#FFB547',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 8,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export const Blur = {
  glass: 24,
  heavy: 36,
  light: 16,
} as const;
