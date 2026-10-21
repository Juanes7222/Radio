import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Durations, Spring } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const PRESSED_SCALE = 0.97;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * A button that answers the finger.
 *
 * The app used to speak three languages on the same gesture: a spring in the
 * player controls, a scale in the tab bar and a plain opacity everywhere else.
 * This is the single one: the control sinks a little and comes back, so the
 * hand feels the interface listened. With the system asking for less movement
 * the control only changes its opacity.
 */
export function PressableScale({ children, style, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ scale: 1 - pressed.value * (1 - PRESSED_SCALE) }],
    opacity: 1 - pressed.value * 0.06,
  }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={(event) => {
        pressed.value = withSpring(1, Spring.snappy);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.value = withTiming(0, { duration: Durations.fast });
        onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
