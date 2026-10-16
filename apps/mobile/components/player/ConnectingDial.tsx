import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { Motion } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { clamp, useResponsive } from '@/lib/responsive';

const STROKE = 3;

/**
 * The "Conectando con la emisora…" state.
 *
 * Replaces a platform ActivityIndicator with an indeterminate arc over a
 * breathing halo, using the same loop language as LiveDot and DialVivo: the
 * screen that says "we are reaching the station" is the first thing the app
 * shows, so it should already sound and look like the station rather than like
 * a generic spinner. It follows the player dial with the same restraint: a
 * gentle width scale inside bounds, so it never dwarfs a small phone nor
 * disappears on a large one.
 *
 * Under Reduce Motion both loops stop and the arc stays as a static ring, which
 * still communicates the state without moving.
 */
export function ConnectingDial() {
  const reduceMotion = useReducedMotion();
  const { scale } = useResponsive();
  const size = clamp(scale(180), 150, 200);
  const spin = useSharedValue(0);
  const halo = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      spin.value = 0;
      halo.value = 0;
      return;
    }
    spin.value = withRepeat(
      withTiming(1, { duration: Motion.spinMs, easing: Easing.linear }),
      -1,
      false
    );
    halo.value = withRepeat(
      withTiming(1, {
        duration: Motion.haloPulseMs,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false
    );
  }, [halo, reduceMotion, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + halo.value * 0.16 }],
    opacity: 0.28 * (1 - halo.value),
  }));

  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.26;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {!reduceMotion && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            { width: size, height: size, borderRadius: size / 2 },
            haloStyle,
          ]}
        />
      )}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, spinStyle]}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={Colors.signal}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    backgroundColor: Colors.signal,
  },
});
