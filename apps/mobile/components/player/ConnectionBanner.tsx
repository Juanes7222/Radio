import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, Easing } from 'react-native-reanimated';
import { Colors, Radii, Spacing } from '@/constants/theme';

interface ConnectionBannerProps {
  reconnectAttempt: number;
  error: string | null;
}

export function ConnectionBanner({ reconnectAttempt, error }: ConnectionBannerProps) {
  if (reconnectAttempt <= 0 && !error) return null;
  const isReconnecting = reconnectAttempt > 0;

  return (
    <Animated.View
      entering={FadeInDown.duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
      exiting={FadeOutUp.duration(180).easing(Easing.bezier(0.4, 0, 1, 1))}
      style={[styles.banner, isReconnecting ? styles.bannerAmber : styles.bannerRed]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion={isReconnecting ? 'polite' : 'assertive'}
    >
      {isReconnecting && (
        <ActivityIndicator size="small" color="#fff" style={styles.spinner} />
      )}
      <Text style={styles.bannerText} numberOfLines={2}>
        {error ?? `Reconectando… intento ${reconnectAttempt}`}
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
  bannerText: { color: '#fef3c7', fontSize: 13, flex: 1 },
  spinner: { marginRight: 8 },
});
