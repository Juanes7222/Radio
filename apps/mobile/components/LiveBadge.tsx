import { useEffect } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radii, Typography } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { scale } from '@/lib/responsive';

const PULSE_MS = 900;

interface LiveBadgeProps {
  listenersCount: number;
}

export function LiveBadge({ listenersCount }: LiveBadgeProps) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  // Reanimated instead of the legacy Animated loop: it runs on the UI thread and
  // shares the app-wide reduced-motion source. The loop also has to stop when
  // the app is backgrounded — an infinite native animation kept running behind
  // a locked screen was burning battery for nothing.
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        cancelAnimation(pulse);
      } else if (!reduceMotion) {
        pulse.value = withRepeat(
          withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.ease) }),
          -1,
          false
        );
      }
    });
    return () => subscription.remove();
  }, [pulse, reduceMotion]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.9 }],
    opacity: 0.8 * (1 - pulse.value),
  }));

  const formattedListeners = listenersCount > 999
    ? `${(listenersCount / 1000).toFixed(1)}k`
    : String(listenersCount);
  const accessibilityLabel =
    listenersCount > 0
      ? `En vivo, ${formattedListeners} ${listenersCount === 1 ? 'oyente' : 'oyentes'}`
      : 'En vivo';

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.dotContainer} accessible={false} importantForAccessibility="no-hide-descendants">
        {!reduceMotion && (
          <Animated.View style={[styles.pulseDot, pulseStyle]} />
        )}
        <View style={styles.solidDot} />
      </View>

      <Text style={styles.liveLabel}>EN VIVO</Text>

      {listenersCount > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.listenersText}>
            {formattedListeners} {listenersCount === 1 ? 'oyente' : 'oyentes'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.tallyMuted,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.tallyGlow,
  },
  dotContainer: {
    width: scale(8),
    height: scale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    position: 'absolute',
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: Colors.danger,
  },
  solidDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: Colors.danger,
  },
  liveLabel: {
    ...Typography.label,
    color: Colors.danger,
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.tallyGlow,
  },
  listenersText: {
    ...Typography.caption,
    color: Colors.danger,
    fontWeight: '600',
  },
});
