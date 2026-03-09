import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii } from '@/constants/theme';

interface PlayerControlsProps {
  isPlaying: boolean;
  isBuffering: boolean;
  isFavorite: boolean;
  onTogglePlay: () => void;
  onToggleFavorite: () => void;
}

export function PlayerControls({
  isPlaying,
  isBuffering,
  isFavorite,
  onTogglePlay,
  onToggleFavorite,
}: PlayerControlsProps) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onToggleFavorite}
        style={({ pressed }) => [styles.sideButton, pressed && styles.pressed]}
        accessibilityLabel={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      >
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={24}
          color={isFavorite ? Colors.danger : Colors.textMuted}
        />
      </Pressable>

      <Pressable
        onPress={onTogglePlay}
        style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
        accessibilityLabel={isPlaying ? 'Pausar' : 'Reproducir'}
        accessibilityRole="button"
      >
        {isBuffering ? (
          <ActivityIndicator size="large" color={Colors.background} />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={36}
            color={Colors.background}
            style={!isPlaying ? { marginLeft: 4 } : undefined}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  sideButton: {
    width: 48,
    height: 48,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: {
    opacity: 0.6,
    transform: [{ scale: 0.93 }],
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: Radii.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 12,
  },
  playButtonPressed: {
    transform: [{ scale: 0.93 }],
    shadowOpacity: 0.3,
  },
});
