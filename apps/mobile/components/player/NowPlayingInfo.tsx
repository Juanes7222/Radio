import { StyleSheet, Text, View } from 'react-native';
import TextTicker from 'react-native-text-ticker';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface NowPlayingInfoProps {
  title: string;
  artist: string;
  isPreaching: boolean;
}

export function NowPlayingInfo({ title, artist, isPreaching }: NowPlayingInfoProps) {
  return (
    <View style={styles.songInfo}>
      {isPreaching && (
        <View style={styles.preachingBadge}>
          <Text style={styles.preachingBadgeText}>Prédica</Text>
        </View>
      )}
      <TextTicker
        style={styles.songTitle}
        duration={8000}
        loop
        bounce={false}
        repeatSpacer={50}
        marqueeDelay={2000}
      >
        {title}
      </TextTicker>
      {artist ? (
        <TextTicker
          style={styles.artistName}
          duration={8000}
          loop
          bounce={false}
          repeatSpacer={50}
          marqueeDelay={2000}
        >
          {artist}
        </TextTicker>
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
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  preachingBadgeText: {
    ...Typography.caption,
    color: Colors.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
