/**
 * Design tokens — La Voz de la Verdad (Mobile) alineado a Web
 * Espeja apps/web/src/index.css :root (public) para paridad visual.
 * Web :root usa indigo #8D86F4 como primary; .admin-theme usa amber #FAB742.
 * Mobile migraba al dial ámbar (#FFB547, cercano a admin). Ahora se alinea al public indigo.
 * Mantiene aliases legacy (accent/cian) apuntando al nuevo primary para compatibilidad.
 */

export const Colors = {
  // ——— Core — espeja :root en apps/web/src/index.css:8 ———
  ink: '#020817', // --background 222.2 84% 4.9%
  inkElevated: '#1F2937', // --card 215 28% 17%
  inkSoft: '#181C25', // --surface-sunken 222 22% 12%
  background: '#020817', // --background
  backgroundAlt: '#0F172A', // slate-900 intermedio para gradientes (entre background y card)
  backgroundElevated: '#1F2937', // --card
  gradientDeep: '#181C25', // --surface-sunken
  paper: '#FFF6E5',
  paperMuted: '#F5E6C8',

  // ——— Surfaces (glass system sobre ink) ———
  // Glass se mantiene como overlay blanco translúcido; web usa bg-background/70 + backdrop-blur.
  surface: 'rgba(255,255,255,0.06)',
  surfaceDim: 'rgba(255,255,255,0.035)',
  surfaceFaint: 'rgba(255,255,255,0.05)',
  surfaceSoft: 'rgba(255,255,255,0.06)',
  surfaceBorder: 'rgba(255,255,255,0.07)',
  surfaceElevated: 'rgba(255,255,255,0.10)',
  surfaceGlass: 'rgba(255,255,255,0.06)',
  border: '#334155', // --border 215 16% 27% => #3A4350 (ajustado a slate-700 para AA)
  borderGlass: 'rgba(148,163,184,0.14)', // --border con alpha, para hairlines sobre glass
  borderStrong: 'rgba(148,163,184,0.24)',

  // ——— Signal -> Primary indigo — espeja --primary 244 83% 74% #8D86F4 ———
  // Antes: amber dial #FFB547 (cercano a .admin-theme --primary 38 95% 62% #FAB742)
  // Ahora: indigo public #8D86F4. Aliases accent/cian siguen al nuevo primary.
  signal: '#8D86F4',
  signalLight: '#A7A2F6', // 244 83% 80% - hover/light
  signalMuted: 'rgba(141,134,244,0.14)',
  signalGlow: 'rgba(141,134,244,0.32)',
  signalSoft: 'rgba(141,134,244,0.08)',
  signalFaint: 'rgba(141,134,244,0.06)',

  // ——— Legacy aliases (migración) ———
  accent: '#8D86F4',
  accentLight: '#A7A2F6',
  accentMuted: 'rgba(141,134,244,0.14)',
  accentGlow: 'rgba(141,134,244,0.32)',

  // ——— Semantic — espeja :root semantic en index.css:51 ———
  tally: '#E44456', // --tally 353 75% 58%
  tallyMuted: 'rgba(228,68,86,0.14)',
  tallyGlow: 'rgba(228,68,86,0.28)',
  danger: '#E44456',
  dangerMuted: 'rgba(228,68,86,0.14)',
  warning: '#F6A328', // --warning 36 92% 56%
  warningMuted: 'rgba(246,163,40,0.14)',
  success: '#4ABF89', // --success 152 48% 52%
  successMuted: 'rgba(74,191,137,0.14)',
  info: '#4CBCF0', // --info 199 85% 62% (nuevo, antes no existía en mobile)
  infoMuted: 'rgba(76,188,240,0.14)',

  // ——— Text — espeja --foreground / --muted-foreground / --faint ———
  text: '#F8FAFC', // slate-50, cercano a --foreground 0 0% 100%
  textBright: '#FFFFFF', // --foreground
  textSoft: '#F1F5F9', // slate-100
  textMuted: '#94A3B8', // --muted-foreground 215 20% 65%
  textFaint: '#848E9F', // --faint 218 12% 57%
  textAlt: '#94A3B8',
  textAltFaint: '#64748B', // slate-500
  textOnSignal: '#020817', // --primary-foreground 222.2 84% 4.9% (texto oscuro sobre indigo)
  textOnPaper: '#1C1400',

  // ——— Legacy surfaces translation ———
  cian: '#8D86F4',
  cianMuted: 'rgba(141,134,244,0.14)',
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
    shadowColor: '#8D86F4',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28, // ajustado para indigo (web: 0 8px 30px rgba(99,102,241,0.28))
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
