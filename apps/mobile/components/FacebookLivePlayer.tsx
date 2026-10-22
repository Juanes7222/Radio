import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Linking,
  TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Spacing } from '@/constants/theme';
import { CONTENT_MAX_WIDTH, useResponsive } from '@/lib/responsive';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const PULSE_MS = 900;

interface FacebookLivePlayerProps {
  liveUrl: string | null;
}

/**
 * The player fills its slot instead of computing a width from the raw window:
 * it lives inside the padded centre section, so the old `SCREEN_WIDTH - 32`
 * was 16dp wider than its container (the section pads 24 on each side) and
 * overflowed horizontally on every phone. The measured width is only needed
 * for the Facebook embed URL, which wants a pixel value.
 */
export function FacebookLivePlayer({ liveUrl }: FacebookLivePlayerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const { width: screenWidth } = useResponsive();
  const playerWidth = Math.min(screenWidth, CONTENT_MAX_WIDTH) - Spacing.lg * 2;
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  // The live moment is the one place in the app that should breathe: the dot
  // swells and fades so the eye reads "the station is on air" without reading
  // a word. It stops when the system asks for less movement.
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

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.9 }],
    opacity: 0.8 * (1 - pulse.value),
  }));

  if (!liveUrl) {
    return (
      <View style={styles.placeholderContainer}>
        <View style={styles.iconContainer}>
          <Ionicons name="radio" size={40} color={Colors.textFaint} />
        </View>
        <Text style={styles.title}>No hay transmisión en vivo</Text>
        <Text style={styles.subtitle}>
          Cuando iniciemos una transmisión en vivo en Facebook, aparecerá aquí.
        </Text>
      </View>
    );
  }

  const getEmbedUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const videoId = urlObj.searchParams.get('v');
      const embedBase = videoId
        ? `https://www.facebook.com/video/video.php?v=${videoId}`
        : url;
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
        embedBase
      )}&show_text=false&width=${Math.floor(playerWidth)}`;
    } catch (e) {
      console.error('Error parsing liveUrl:', e);
      return url;
    }
  };

  const embedUrl = getEmbedUrl(liveUrl);

  return (
    <View style={styles.container}>
      <View style={styles.liveBadgeWrapper}>
        <View style={styles.liveBadge}>
          <View style={styles.pulseContainer}>
            {!reduceMotion && <Animated.View style={[styles.pulse, pulseStyle]} />}
            <View style={styles.dot} />
          </View>
          <Text style={styles.liveText}>EN VIVO</Text>
          <Ionicons name="logo-facebook" size={16} color="#fff" />
        </View>
      </View>

      <View style={styles.playerContainer}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        )}
        <WebView
          source={{ uri: embedUrl }}
          style={styles.webview}
          scrollEnabled={false}
          bounces={false}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          onLoad={() => setIsLoading(false)}
        />
      </View>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => Linking.openURL(liveUrl)}
        activeOpacity={0.7}
      >
        <Text style={styles.linkText}>Abrir en Facebook</Text>
        <Ionicons name="open-outline" size={16} color="#60a5fa" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 16,
  },
  placeholderContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    marginVertical: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
  liveBadgeWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.tally,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  pulseContainer: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  pulse: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    opacity: 0.75,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  liveText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 1,
    marginRight: 8,
  },
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  loadingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  webview: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
    minHeight: 48,
    minWidth: 48,
  },
  linkText: {
    fontSize: 14,
    color: '#60a5fa',
  },
});