import * as Haptics from 'expo-haptics';

/**
 * The four vibrations of the app.
 *
 * Haptics used to be scattered: thirty-six calls, most of them the same tick,
 * and a "warning" notification used for things that were not warnings. A
 * listener learns what a vibration means by repetition, so the same class of
 * action has to feel the same everywhere: a selector ticks, a button clicks,
 * something that succeeded says so once, and something that was rejected
 * answers twice.
 */

let errorPulseTimer: ReturnType<typeof setTimeout> | null = null;

/** A selector, a switch, a chip, a row. */
export function tick(): void {
  Haptics.selectionAsync().catch(() => {});
}

/** A primary action: play, pause, save. */
export function click(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Something the listener asked for went through. */
export function success(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Something was rejected or stopped: two short pulses. */
export function error(): void {
  if (errorPulseTimer) clearTimeout(errorPulseTimer);
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  errorPulseTimer = setTimeout(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    errorPulseTimer = null;
  }, 90);
}
