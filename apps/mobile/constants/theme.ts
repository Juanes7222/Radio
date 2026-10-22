/**
 * Design tokens — La Voz de la Verdad (Mobile)
 * Base: apps/web/src/index.css :root. Se conserva la familia azul de noche y el
 * índigo #8D86F4 del logo en ink, signal, tally y los colores semánticos.
 * Los escalones de superficie y los tonos de texto son propios del móvil: la
 * web comparte la familia, no los mismos valores.
 * Mantiene aliases legacy (accent/cian) apuntando al primary para compatibilidad.
 */

export const Colors = {
  // ——— Core — noche azul: tres escalones, de ink a inkElevated ———
  ink: '#020817', // --background 222.2 84% 4.9%
  inkElevated: '#16264D', // superficie elevada: marino de la familia
  inkSoft: '#121C36', // escalón medio del degradado
  background: '#020817', // --background
  backgroundAlt: '#0B1530', // base bajo el degradado (medianoche)
  backgroundElevated: '#16264D', // --card
  gradientDeep: '#121C36', // escalón medio del degradado

  // ——— Surfaces (glass system sobre ink) ———
  // Glass se mantiene como overlay blanco translúcido; web usa bg-background/70 + backdrop-blur.
  surface: 'rgba(255,255,255,0.06)',
  surfaceDim: 'rgba(255,255,255,0.035)',
  surfaceFaint: 'rgba(255,255,255,0.05)',
  surfaceSoft: 'rgba(255,255,255,0.06)',
  surfaceBorder: 'rgba(255,255,255,0.07)',
  surfaceElevated: 'rgba(255,255,255,0.10)',
  surfaceGlass: 'rgba(255,255,255,0.06)',
  border: '#2A3A5C', // línea visible de la familia azul
  borderGlass: 'rgba(150,175,225,0.14)', // hairline sobre glass
  borderStrong: 'rgba(150,175,225,0.24)', // agarradera de hoja

  // ——— Signal -> Primary indigo — espeja --primary 244 83% 74% #8D86F4 ———
  // Antes: amber dial #FFB547 (cercano a .admin-theme --primary 38 95% 62% #FAB742)
  // Ahora: indigo public #8D86F4. Aliases accent/cian siguen al nuevo primary.
  signal: '#8D86F4',
  signalLight: '#A7A2F6', // 244 83% 80% - hover/light
  signalMuted: 'rgba(141,134,244,0.14)',
  signalGlow: 'rgba(141,134,244,0.32)',
  signalSoft: 'rgba(141,134,244,0.08)',
  signalFaint: 'rgba(141,134,244,0.06)',
  // Filled accent surfaces. `signal` stays for strokes, rings, halos and marks;
  // `signalFill` is for a filled surface that carries a label or a glyph.
  signalFill: '#7C74F0',

  // Scrims: the ink of the app at three opacities.
  scrim: 'rgba(2,8,23,0.88)', // tab bar
  scrimStrong: 'rgba(2,8,23,0.92)', // player control bar
  scrimSoft: 'rgba(2,8,23,0.55)', // bible modal backdrop
  // The sheet surface at zero alpha. A gradient towards 'transparent'
  // interpolates through black and leaves a grey band.
  inkElevatedFade: 'rgba(22,38,77,0)',

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
  warningGlow: 'rgba(246,163,40,0.25)', // warning ring on a filled surface
  success: '#4ABF89', // --success 152 48% 52%
  successMuted: 'rgba(74,191,137,0.14)',
  info: '#4CBCF0', // --info 199 85% 62% (nuevo, antes no existía en mobile)
  infoMuted: 'rgba(76,188,240,0.14)',

  // ——— Text — blanco azulado y sus tres escalones de gris azulado ———
  // Secondary text is tinted from the blue of the surfaces instead of slate:
  // a grey label on a blue ground is what makes a dark app read as generic.
  text: '#F1F4FA', // blanco azulado
  textBright: '#FFFFFF', // --foreground
  textSoft: '#DCE4F0',
  textMuted: '#97A6C0', // 8.1:1 sobre ink
  textFaint: '#7C8AA6', // 5.8:1 sobre ink
  textAlt: '#97A6C0',
  textAltFaint: '#6E7C96', // 4.75:1 sobre ink
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

import type { TextStyle } from 'react-native';

export const Typography = {
  display: { fontFamily: Fonts.displayBold, fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.8, lineHeight: 32 },
  screenTitle: { fontFamily: Fonts.bodyBold, fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.4, lineHeight: 26 },
  sectionTitle: { fontFamily: Fonts.bodySemi, fontSize: 14, fontWeight: '700' as const, letterSpacing: -0.2, lineHeight: 18 },
  songTitle: { fontFamily: Fonts.displaySemi, fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 26 },
  // The body of a letter: a petition, or the answer the team wrote back. Set
  // in the serif because this is the one place the app is read, not used.
  message: { fontFamily: Fonts.displaySemi, fontSize: 20, fontWeight: '600' as const, lineHeight: 30 },
  artistName: { fontFamily: Fonts.bodyMedium, fontSize: 15, fontWeight: '500' as const, letterSpacing: -0.1, lineHeight: 20 },
  albumName: { fontFamily: Fonts.bodyRegular, fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  body: { fontFamily: Fonts.bodyRegular, fontSize: 16, fontWeight: '400' as const, lineHeight: 23 },
  bodyStrong: { fontFamily: Fonts.bodySemi, fontSize: 16, fontWeight: '600' as const, lineHeight: 23 },
  // Small label. Sentence case: the app never shouts, and a 13px label on a
  // dark surface needs a touch of tracking to stay legible.
  label: { fontFamily: Fonts.bodyBold, fontSize: 13, fontWeight: '700' as const, letterSpacing: 0.3, lineHeight: 17 },
  // Metadata. 13px is the floor for anything a listener has to read on this
  // app: 12px is a size for a caption nobody reads, and the audience of a
  // radio station is not twenty years old.
  caption: { fontFamily: Fonts.bodyRegular, fontSize: 13, fontWeight: '400' as const, letterSpacing: 0.1, lineHeight: 18 },
  captionStrong: { fontFamily: Fonts.bodySemi, fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.1, lineHeight: 18 },
  mono: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.04 * 12, lineHeight: 16, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
  monoLarge: { fontFamily: Fonts.mono, fontSize: 14, fontWeight: '600' as const, letterSpacing: 0.02 * 14, lineHeight: 18, fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] },
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
