/**
 * Motion system — single orchestrated moment per screen.
 * All durations use reanimated worklets; spring is default for interactive,
 * timing for ambient.
 */
import { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';

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
  // Indeterminate "working" rotation (loading dial, buffering arc)
  spinMs: 1400,
  // Entry choreography
  entryStaggerMs: 40,
} as const;

/**
 * The three entrances of the app.
 *
 * A screen that re-enters with the same animation everywhere reads as
 * assembled: the movement stops carrying information. These are the three
 * relationships that actually exist — an item of a list, a sheet, a block of a
 * form — and each one arrives in its own way.
 */
export const Entrances = {
  /** An item of a list: it slides in and settles. */
  enterList: (delay = 60) =>
    FadeInDown.delay(delay).duration(Durations.normal).easing(Easing.bezier(...Easings.enter)),
  /** A sheet: it fades, because it comes from over the content. */
  enterSheet: (delay = 0) =>
    FadeIn.delay(delay).duration(Durations.fast).easing(Easing.bezier(...Easings.enter)),
  /** A block of a form: it rises from below the header. */
  enterBlock: (delay = 100) =>
    FadeInDown.delay(delay).duration(Durations.normal).easing(Easing.bezier(...Easings.enter)),
};
