import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TextTicker from 'react-native-text-ticker';
import Animated, { FadeInDown, FadeOut, Easing } from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { formatMediaTitle } from '@/lib/formatMedia';

interface NextUpCardProps {
  song: { title: string; artist: string };
  /** When false the marquee animation stops (screen not focused). */
  active?: boolean;
}

export function NextUpCard({ song, active = true }: NextUpCardProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then((enabled: boolean) => setReduceMotion(!!enabled))
      .catch(() => {});
  }, []);

  const { artist, title } = formatMediaTitle(song.title, song.artist);

  return (
    <Animated.View
      entering={FadeInDown.delay(120).duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}
      exiting={FadeOut.duration(180)}
      style={styles.nextCard}
    >
      <Ionicons name="play-skip-forward" size={13} color={Colors.accent} />
      <Text style={styles.nextLabel}>A continuación: </Text>

      <View style={styles.nextTickerContainer}>
        {active && !reduceMotion ? (
          <TextTicker
            duration={8000}
            loop
            bounce={false}
            repeatSpacer={50}
            marqueeDelay={2000}
          >
            <Text style={styles.nextArtist}>{artist}</Text>
            <Text style={styles.nextSeparator}> · </Text>
            <Text style={styles.nextTitle}>{title}</Text>
          </TextTicker>
        ) : (
          <Text numberOfLines={1} style={styles.nextArtist}>
            {artist ? `${artist} · ${title}` : title}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    width: '100%',
    backgroundColor: Colors.accentMuted,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.signalGlow,
  },
  nextLabel: {
    ...Typography.caption,
    color: Colors.accent,
    fontWeight: '700',
  },
  nextArtist: {
    ...Typography.caption,
    color: Colors.text,
    fontWeight: '600',
    flexShrink: 1,
  },
  nextSeparator: {
    ...Typography.caption,
    color: Colors.textFaint,
  },
  nextTitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    flexShrink: 1,
  },
  nextTickerContainer: {
    flex: 1,
    overflow: 'hidden',
  },
});
