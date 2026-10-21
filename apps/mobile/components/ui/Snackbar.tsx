import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

const AUTO_HIDE_MS = 2600;

interface SnackbarProps {
  /** The message to show. Nothing renders while this is null. */
  message: string | null;
  /** Called when the snackbar hides itself. */
  onHide: () => void;
  /** Distance from the bottom edge, so a screen can clear its tab bar. */
  bottom?: number;
}

/**
 * A brief, non-blocking confirmation.
 *
 * On Android the transient feedback for an action is a snackbar anchored to the
 * bottom edge, not a toast floating over the content: a toast covers what just
 * happened and asks to be dismissed. This one never takes a touch.
 */
export function Snackbar({ message, onHide, bottom = Spacing.xl }: SnackbarProps) {
  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(onHide, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [message, onHide]);

  if (!message) return null;

  return (
    <View style={[styles.anchor, { bottom }]} pointerEvents="none">
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(140)}
        style={styles.snackbar}
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  snackbar: {
    backgroundColor: Colors.inkElevated,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: Radii.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  text: {
    ...Typography.captionStrong,
    color: Colors.text,
  },
});
