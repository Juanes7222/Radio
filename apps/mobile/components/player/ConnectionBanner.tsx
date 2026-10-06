import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, Easing } from 'react-native-reanimated';
import { Colors, Radii, Spacing } from '@/constants/theme';

interface ConnectionBannerProps {
  reconnectAttempt: number;
  error: string | null;
  /**
   * Now-playing metadata failed while the stream itself is still connected.
   * Degraded, not broken: the listener keeps hearing the station, so this must
   * never take the player controls away or read as a fatal error.
   */
  metadataError?: string | null;
}

export function ConnectionBanner({
  reconnectAttempt,
  error,
  metadataError,
}: ConnectionBannerProps) {
  const isReconnecting = reconnectAttempt > 0;
  const hasAudioProblem = isReconnecting || !!error;
  if (!hasAudioProblem && !metadataError) return null;

  const isDegraded = !hasAudioProblem;
  const message = error ?? (isDegraded ? metadataError : `Reconectando… intento ${reconnectAttempt}`);

  return (
    <Animated.View
      entering={FadeInDown.duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
      exiting={FadeOutUp.duration(180).easing(Easing.bezier(0.4, 0, 1, 1))}
      style={[
        styles.banner,
        hasAudioProblem
          ? isReconnecting
            ? styles.bannerAmber
            : styles.bannerRed
          : styles.bannerDegraded,
      ]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion={isReconnecting || isDegraded ? 'polite' : 'assertive'}
    >
      {isReconnecting && (
        <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
      )}
      <Text style={styles.bannerText} numberOfLines={2}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radii.md,
    marginBottom: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bannerAmber: { backgroundColor: 'rgba(146,64,14,0.85)', borderColor: Colors.warning },
  bannerRed: { backgroundColor: 'rgba(127,29,29,0.85)', borderColor: Colors.danger },
  bannerDegraded: { backgroundColor: Colors.surfaceElevated, borderColor: Colors.borderGlass },
  bannerText: { color: '#fef3c7', fontSize: 13, flex: 1 },
  spinner: { marginRight: 8 },
});
