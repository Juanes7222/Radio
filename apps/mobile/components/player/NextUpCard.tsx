import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TextTicker from 'react-native-text-ticker';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { formatMediaTitle } from '@/lib/formatMedia';

interface NextUpCardProps {
  song: { title: string; artist: string };
  /** When false the marquee animation stops (screen not focused). */
  active?: boolean;
}

export function NextUpCard({ song, active = true }: NextUpCardProps) {
  const { artist, title } = formatMediaTitle(song.title, song.artist);

  return (
    <View style={styles.nextCard}>
      <Ionicons name="play-skip-forward" size={13} color={Colors.accent} />
      <Text style={styles.nextLabel}>A continuación: </Text>

      <View style={styles.nextTickerContainer}>
        {active ? (
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
    </View>
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
    borderColor: 'rgba(99,102,241,0.2)',
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
