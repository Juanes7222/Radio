import type { ReactNode } from 'react';
import { TouchableOpacity } from 'react-native';
import type { AccessibilityState, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Durations, Spring } from '@/constants/motion';

const AnimatedPressable = Animated.createAnimatedComponent(TouchableOpacity);

export interface PressScaleProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  disabled?: boolean;
  /** Peak compression while held. Defaults to a subtle 5%. */
  intensity?: number;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  testID?: string;
}

/**
 * A touchable that answers the finger.
 *
 * Every pressable in the app used one of three different feedback languages:
 * a shared value with `withTiming`, a `Pressable` style callback that round
 * trips the JS thread, or a bare `activeOpacity`. This is the one to reach for
 * so that "everything responds the same way" stops being a coincidence.
 *
 * The compression is a transform on the UI thread, and it releases on a spring
 * rather than a timing so an interrupted press still settles.
 */
export function PressScale({
  children,
  style,
  onPress,
  disabled,
  intensity = 0.05,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID,
}: PressScaleProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * intensity }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      style={[style, animatedStyle]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: Durations.instant });
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, Spring.snappy);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}