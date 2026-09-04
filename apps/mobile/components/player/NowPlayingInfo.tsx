import { StyleSheet, Text, View } from 'react-native';
import TextTicker from 'react-native-text-ticker';
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
        <View style={styles.preachingBadge}>
          <View style={styles.preachingDot} />
          <Text style={styles.preachingBadgeText}>Prédica · En vivo</Text>
        </View>
      )}
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
      {artist ? (
        artistLooksLong ? (
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
        )
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
