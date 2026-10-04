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

const SIZE = 180;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ARC_LENGTH = CIRCUMFERENCE * 0.26;

/**
 * The "Conectando con la emisora…" state.
 *
 * Replaces a platform ActivityIndicator with an indeterminate arc over a
 * breathing halo, using the same loop language as LiveDot and DialVivo: the
 * screen that says "we are reaching the station" is the first thing the app
 * shows, so it should already sound and look like the station rather than like
 * a generic spinner.
 *
 * Under Reduce Motion both loops stop and the arc stays as a static ring, which
 * still communicates the state without moving.
 */
export function ConnectingDial() {
  const reduceMotion = useReducedMotion();
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

  return (
    <View
      style={styles.wrap}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {!reduceMotion && (
        <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />
      )}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, spinStyle]}>
        <Svg width={SIZE} height={SIZE}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={Colors.signal}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE - ARC_LENGTH}`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: Colors.signal,
  },
});