import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Radii, Shadows } from '@/constants/theme';
import { scale } from '@/lib/responsive';

interface PlayerControlsProps {
  isPlaying: boolean;
  isBuffering: boolean;
  isFavorite: boolean;
  onTogglePlay: () => void;
  onToggleFavorite: () => void;
  onShare: () => void;
}

export function PlayerControls({
  isPlaying,
  isBuffering,
  isFavorite,
  onTogglePlay,
  onToggleFavorite,
  onShare,
}: PlayerControlsProps) {
  const handleFavorite = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggleFavorite();
  };
  const handlePlay = () => {
    Haptics.impactAsync(
      isPlaying ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    ).catch(() => {});
    onTogglePlay();
  };
  const handleShare = () => {
    Haptics.selectionAsync().catch(() => {});
    onShare();
  };

  return (
    <View style={styles.row}>
      <Pressable
        onPress={handleFavorite}
        style={({ pressed }) => [styles.sideButton, pressed && styles.pressed]}
        accessibilityLabel={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        hitSlop={8}
      >
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={scale(22)}
          color={isFavorite ? Colors.tally : Colors.textMuted}
        />
      </Pressable>

      <Pressable
        onPress={handlePlay}
        style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
        accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}
        accessibilityRole="button"
        hitSlop={8}
      >
        {isBuffering ? (
          <ActivityIndicator size="large" color={Colors.textOnSignal} />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={scale(34)}
            color={Colors.textOnSignal}
            style={!isPlaying ? { marginLeft: scale(3) } : undefined}
          />
        )}
      </Pressable>

      <Pressable
        onPress={handleShare}
        style={({ pressed }) => [styles.sideButton, pressed && styles.pressed]}
        accessibilityLabel="Compartir"
        hitSlop={8}
      >
        <Ionicons name="share-outline" size={scale(22)} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(40),
  },
  sideButton: {
    width: scale(46),
    height: scale(46),
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  playButton: {
    width: scale(76),
    height: scale(76),
    borderRadius: Radii.full,
    backgroundColor: Colors.signal,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.signal,
  },
  playButtonPressed: {
    transform: [{ scale: 0.94 }],
    shadowOpacity: 0.25,
  },
});
