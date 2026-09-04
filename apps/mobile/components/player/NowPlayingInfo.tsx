import { StyleSheet, Text, View } from 'react-native';
import TextTicker from 'react-native-text-ticker';
import Animated, { FadeIn, FadeOut, Easing } from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface NowPlayingInfoProps {
  title: string;
  artist: string;
  isPreaching: boolean;
}

export function NowPlayingInfo({ title, artist, isPreaching }: NowPlayingInfoProps) {
  // Ticker solo si el texto desborda; evitamos marquee molesto en títulos cortos.
  const titleLooksLong = title.length > 28;
  const artistLooksLong = artist.length > 30;

  return (
    <View style={styles.songInfo}>
      {isPreaching && (
        <Animated.View
          entering={FadeIn.duration(220).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          exiting={FadeOut.duration(160)}
          style={styles.preachingBadge}
        >
          <View style={styles.preachingDot} />
          <Text style={styles.preachingBadgeText}>Prédica · En vivo</Text>
        </Animated.View>
      )}
      <Animated.View
        key={`title-${title}`}
        entering={FadeIn.duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
        exiting={FadeOut.duration(160)}
        style={styles.titleWrap}
      >
        {titleLooksLong ? (
          <TextTicker
            style={styles.songTitle}
            duration={9000}
            loop
            bounce={false}
            repeatSpacer={48}
            marqueeDelay={1800}
          >
            {title}
          </TextTicker>
        ) : (
          <Text style={styles.songTitle} numberOfLines={2}>
            {title}
          </Text>
        )}
      </Animated.View>
      {artist ? (
        <Animated.View
          key={`artist-${artist}`}
          entering={FadeIn.delay(40).duration(240).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          exiting={FadeOut.duration(160)}
        >
          {artistLooksLong ? (
            <TextTicker
              style={styles.artistName}
              duration={9000}
              loop
              bounce={false}
              repeatSpacer={48}
              marqueeDelay={1800}
            >
              {artist}
            </TextTicker>
          ) : (
            <Text style={styles.artistName} numberOfLines={1}>
              {artist}
            </Text>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  songInfo: {
    alignItems: 'center',
    gap: Spacing.xs,
    width: '100%',
    paddingHorizontal: Spacing.sm,
  },
  titleWrap: {
    width: '100%',
    alignItems: 'center',
  },
  songTitle: { ...Typography.songTitle, color: Colors.text, textAlign: 'center' },
  artistName: { ...Typography.artistName, color: Colors.textMuted, textAlign: 'center' },
  preachingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.signalMuted,
    borderWidth: 1,
    borderColor: 'rgba(255,181,71,0.22)',
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
  },
  preachingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.signal,
  },
  preachingBadgeText: {
    ...Typography.caption,
    color: Colors.signal,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
});
