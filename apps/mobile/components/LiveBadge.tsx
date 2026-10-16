import { useEffect, useMemo } from 'react';
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
import { clamp, useResponsive } from '@/lib/responsive';

const PULSE_MS = 900;

interface LiveBadgeProps {
  listenersCount: number;
  /**
   * Drop the listener count when the row has no room for it. The top bar
   * decides: "EN VIVO" is the message, the count is secondary, and on narrow
   * phones keeping both pushes the quick actions against the screen edge.
   */
  showListeners: boolean;
}

export function LiveBadge({ listenersCount, showListeners }: LiveBadgeProps) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const { scale } = useResponsive();

  const dotSize = clamp(scale(8), 7, 9);
  const styles = useMemo(() => createStyles(dotSize, scale), [dotSize, scale]);

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

  const countVisible = showListeners && listenersCount > 0;
  const formattedListeners = listenersCount > 999
    ? `${(listenersCount / 1000).toFixed(1)}k`
    : String(listenersCount);
  const accessibilityLabel =
    countVisible
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

      {countVisible && (
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

function createStyles(dotSize: number, scale: (size: number) => number) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: clamp(scale(7), 6, 8),
      backgroundColor: Colors.tallyMuted,
      paddingHorizontal: clamp(scale(14), 11, 16),
      paddingVertical: clamp(scale(7), 6, 8),
      borderRadius: Radii.full,
      borderWidth: 1,
      borderColor: Colors.tallyGlow,
    },
    dotContainer: {
      width: dotSize,
      height: dotSize,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pulseDot: {
      position: 'absolute',
      width: dotSize,
      height: dotSize,
      borderRadius: dotSize / 2,
      backgroundColor: Colors.danger,
    },
    solidDot: {
      width: dotSize,
      height: dotSize,
      borderRadius: dotSize / 2,
      backgroundColor: Colors.danger,
    },
    liveLabel: {
      ...Typography.label,
      color: Colors.danger,
    },
    divider: {
      width: 1,
      height: clamp(scale(12), 10, 14),
      backgroundColor: Colors.tallyGlow,
    },
    listenersText: {
      ...Typography.caption,
      color: Colors.danger,
      fontWeight: '600',
    },
  });
}
