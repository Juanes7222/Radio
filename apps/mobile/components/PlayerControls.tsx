import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { Colors, Radii, Shadows } from '@/constants/theme';
import { scale } from '@/lib/responsive';
import { Spring } from '@/constants/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
  const favScale = useSharedValue(1);
  const favPressed = useSharedValue(0);
  const playPressed = useSharedValue(0);
  const sharePressed = useSharedValue(0);

  useEffect(() => {
    if (isFavorite) {
      favScale.value = withSequence(
        withSpring(1.32, Spring.bouncy),
        withSpring(1, Spring.gentle)
      );
    }
  }, [isFavorite, favScale]);

  const handleFavorite = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // micro burst even when unfaving
    // eslint-disable-next-line react-hooks/immutability
    favScale.value = withSequence(
      withTiming(0.92, { duration: 90, easing: Easing.out(Easing.ease) }),
      withSpring(1, Spring.snappy)
    );
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

  const favStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: favScale.value * (1 - favPressed.value * 0.06) },
    ],
    opacity: 1 - favPressed.value * 0.08,
  }));

  const playStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - playPressed.value * 0.06 }],
  }));

  const shareStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - sharePressed.value * 0.06 }],
    opacity: 1 - sharePressed.value * 0.08,
  }));

  return (
    <View style={styles.row}>
      <AnimatedPressable
        onPress={handleFavorite}
        onPressIn={() => { favPressed.value = withTiming(1, { duration: 110 }); }}
        onPressOut={() => { favPressed.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.ease) }); }}
        style={[styles.sideButton, favStyle]}
        accessibilityLabel={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        accessibilityRole="button"
        accessibilityState={{ selected: isFavorite }}
        accessibilityHint="Avisa cuando suene esta canción si activas notificaciones"
        hitSlop={12}
      >
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={scale(22)}
          color={isFavorite ? Colors.tally : Colors.textMuted}
        />
      </AnimatedPressable>

      <AnimatedPressable
        onPress={handlePlay}
        onPressIn={() => { playPressed.value = withTiming(1, { duration: 110 }); }}
        onPressOut={() => { playPressed.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.ease) }); }}
        style={[styles.playButton, playStyle]}
        accessibilityLabel={isBuffering ? 'Cargando emisión' : isPlaying ? 'Pausar' : 'Reproducir'}
        accessibilityRole="button"
        accessibilityState={{ busy: isBuffering }}
        accessibilityHint={isPlaying ? 'Pausa la emisión en vivo' : 'Reanuda la emisión en vivo'}
        hitSlop={12}
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
      </AnimatedPressable>

      <AnimatedPressable
        onPress={handleShare}
        onPressIn={() => { sharePressed.value = withTiming(1, { duration: 110 }); }}
        onPressOut={() => { sharePressed.value = withTiming(0, { duration: 160, easing: Easing.out(Easing.ease) }); }}
        style={[styles.sideButton, shareStyle]}
        accessibilityLabel="Compartir emisora"
        accessibilityRole="button"
        accessibilityHint="Comparte un enlace a la aplicación"
        hitSlop={12}
      >
        <Ionicons name="share-outline" size={scale(22)} color={Colors.textMuted} />
      </AnimatedPressable>
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
  playButton: {
    width: scale(76),
    height: scale(76),
    borderRadius: Radii.full,
    backgroundColor: Colors.signal,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.signal,
  },
});
