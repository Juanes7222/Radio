import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { Durations, Easings, Motion, Spring } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 64;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface SleepTimerBubbleProps {
  /** "mm:ss" */
  display: string;
  /** 1 = full preset remaining, 0 = about to expire. Null omits the arc. */
  progress: number | null;
  onPress: () => void;
  onCancel: () => void;
}

/**
 * Sleep timer as a single object instead of a text row.
 *
 * The ring is the point: `progress` is the fraction of the chosen preset still
 * left, so the object answers "how much longer" without reading the digits.
 * The clock only refreshes every 5s, so each step is eased over `Durations.fast`
 * to hide the polling granularity the same way DialVivo eases its progress ring.
 *
 * Tapping the bubble opens the preset sheet; the trailing control cancels in
 * one tap, so nothing the previous row offered is lost.
 */
function SleepTimerBubbleImpl({
  display,
  progress,
  onPress,
  onCancel,
}: SleepTimerBubbleProps) {
  const reduceMotion = useReducedMotion();

  const arc = useSharedValue(progress ?? 0);
  const halo = useSharedValue(0);
  const cancelScale = useSharedValue(1);

  useEffect(() => {
    if (progress === null) return;
    arc.value = reduceMotion
      ? progress
      : withTiming(progress, {
          duration: Durations.fast,
          easing: Easing.out(Easing.ease),
        });
  }, [arc, progress, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      halo.value = 0;
      return;
    }
    halo.value = withRepeat(
      withTiming(1, {
        duration: Motion.haloPulseMs,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false
    );
  }, [halo, reduceMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + halo.value * 0.14 }],
    opacity: 0.45 * (1 - halo.value),
  }));

  const cancelStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cancelScale.value }],
  }));

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - arc.value),
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
      exiting={FadeOut.duration(Durations.fast).easing(Easing.bezier(...Easings.exit))}
      style={styles.row}
    >
      <View style={styles.bubbleWrap}>
        {!reduceMotion && <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />}

        <AnimatedPressable
          onPress={onPress}
          style={styles.bubble}
          accessibilityRole="button"
          accessibilityLabel={`Temporizador de apagado activo, ${display} restantes`}
          accessibilityHint="Abre las opciones del temporizador"
        >
          <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={STROKE}
            />
            {progress !== null && (
              <AnimatedCircle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={Colors.warning}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                animatedProps={arcProps}
              />
            )}
          </Svg>
          <Text style={styles.time}>{display}</Text>
        </AnimatedPressable>
      </View>

      <AnimatedPressable
        onPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          onCancel();
        }}
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutable by design; same exemption as PlayerControls.
        onPressIn={() => { cancelScale.value = withTiming(0.92, { duration: Durations.instant }); }}
        // eslint-disable-next-line react-hooks/immutability
        onPressOut={() => { cancelScale.value = withSpring(1, Spring.snappy); }}
        style={[styles.cancel, cancelStyle]}
        accessibilityRole="button"
        accessibilityLabel="Cancelar temporizador de apagado"
      >
        <Ionicons name="close" size={18} color={Colors.warning} />
      </AnimatedPressable>
    </Animated.View>
  );
}

export const SleepTimerBubble = memo(SleepTimerBubbleImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    width: '100%',
  },
  bubbleWrap: { width: SIZE, height: SIZE },
  halo: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: Colors.warning,
  },
  bubble: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: Colors.surfaceDim,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    ...Typography.monoLarge,
    color: Colors.warning,
    fontSize: 14,
  },
  cancel: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceDim,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
});