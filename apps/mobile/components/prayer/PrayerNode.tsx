import { StyleSheet, View } from 'react-native';
import { Colors } from '@/constants/theme';

/**
 * The marker of a petition on its thread.
 *
 * A petition and the answer that follows it are two moments in the same
 * conversation, so the state is a node on a line and not a badge: a hollow
 * ring while the team has not answered, a filled dot once they have, and an
 * indigo dot with a halo while the answer is still unread.
 */
export type PrayerNodeTone = 'waiting' | 'answered' | 'unread' | 'muted';

interface PrayerNodeProps {
  tone: PrayerNodeTone;
}

export function PrayerNode({ tone }: PrayerNodeProps) {
  if (tone === 'answered') {
    return <View style={styles.answered} />;
  }

  if (tone === 'unread') {
    return (
      <View style={styles.unread}>
        <View style={styles.unreadHalo} />
        <View style={styles.unreadCore} />
      </View>
    );
  }

  return <View style={[styles.hollow, tone === 'muted' && styles.hollowMuted]} />;
}

const styles = StyleSheet.create({
  hollow: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.textFaint,
  },
  hollowMuted: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderColor: Colors.textAltFaint,
  },
  answered: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.success,
  },
  unread: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadHalo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Colors.signalMuted,
  },
  unreadCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.signal,
  },
});
