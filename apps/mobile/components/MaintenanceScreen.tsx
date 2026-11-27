import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MaintenanceStatus } from '@radio/types';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const BAR_HEIGHTS = [10, 18, 26, 14, 22, 12, 20];

function EqualizerBar({ height, index }: { height: number; index: number }) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(0.45);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(scale);
      scale.value = 0.45;
      return;
    }

    scale.value = withDelay(
      index * 90,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 640, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.35, { duration: 640, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      )
    );

    return () => cancelAnimation(scale);
  }, [index, reducedMotion, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));

  return <Animated.View style={[styles.bar, { height }, style]} />;
}

interface MaintenanceScreenProps {
  status: MaintenanceStatus;
}

/**
 * Full-screen takeover while the station is offline. The copy is the one the
 * operator saved in the panel; the mark, pulse and equalizer mirror the public
 * web screen with the mobile tokens, and every ambient loop stops when the
 * system asks for reduced motion.
 */
export function MaintenanceScreen({ status }: MaintenanceScreenProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const note = status.footerNote.trim();

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }

    pulse.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );

    return () => cancelAnimation(pulse);
  }, [pulse, reducedMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.4 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.5 }],
  }));

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Colors.ink, Colors.backgroundAlt, Colors.ink]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.markWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.View style={[styles.ring, ringStyle]} />
            <View style={styles.mark}>
              <Ionicons name="radio-outline" size={30} color={Colors.signal} />
            </View>
          </View>

          <View style={styles.chip}>
            <View style={styles.dot} />
            <Text style={styles.chipText}>Mantenimiento en progreso</Text>
          </View>

          <Text accessibilityRole="header" style={styles.title}>
            {status.title}
          </Text>

          <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <View style={styles.equalizer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {BAR_HEIGHTS.map((height, index) => (
              <EqualizerBar key={`${height}-${index}`} height={height} index={index} />
            ))}
          </View>

          <Text style={styles.message}>{status.message}</Text>

          {note ? (
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={15} color={Colors.textFaint} />
              <Text style={styles.noteText}>{note}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.station}>La Voz de la Verdad</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.ink,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderRadius: Radii['2xl'],
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.inkElevated,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    overflow: 'hidden',
    ...Shadows.soft,
  },
  markWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  ring: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: Colors.signal,
  },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    backgroundColor: Colors.signalSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: Radii.full,
    backgroundColor: Colors.signalMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.signal,
  },
  chipText: {
    ...Typography.label,
    color: Colors.signalLight,
  },
  title: {
    ...Typography.display,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  divider: {
    width: 80,
    height: 1,
    marginTop: Spacing.md,
    backgroundColor: Colors.signalGlow,
  },
  equalizer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    marginTop: Spacing.md,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: Colors.signal,
    opacity: 0.65,
  },
  message: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  noteText: {
    ...Typography.caption,
    flex: 1,
    color: Colors.textFaint,
    textAlign: 'center',
  },
  station: {
    ...Typography.mono,
    color: Colors.textAltFaint,
    textAlign: 'center',
  },
});
