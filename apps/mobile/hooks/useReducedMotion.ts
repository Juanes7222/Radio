import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the system "Remove animations" setting and keeps following it while
 * the app is running, so a change mid-session takes effect without a restart.
 *
 * Ambient loops (breathing, spinning) must be gated on this. Transitions that
 * carry state (an arc draining, a row appearing) should keep animating but
 * drop their spatial movement.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduced(enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}