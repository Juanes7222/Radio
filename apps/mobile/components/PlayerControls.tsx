import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  withSequence,
} from 'react-native-reanimated';
import { memo, useEffect } from 'react';
import { Colors, Radii, Shadows } from '@/constants/theme';
import { scale } from '@/lib/responsive';
import { Durations, Motion, Spring } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const PLAY_SIZE = 76;
const BUFFER_STROKE = 2.5;
const BUFFER_RADIUS = (PLAY_SIZE + BUFFER_STROKE * 2) / 2 - 1;
const BUFFER_CIRCUMFERENCE = 2 * Math.PI * BUFFER_RADIUS;
const BUFFER_ARC = BUFFER_CIRCUMFERENCE * 0.26;

/**
 * Indeterminate arc drawn around the play button while the stream buffers.
 * Same rotation language as ConnectingDial, so "working" looks the same
 * everywhere in the app, and it keeps the play affordance in place instead of
 * replacing it with a spinner.
 */
function BufferingArc() {
  const reduceMotion = useReducedMotion();
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = reduceMotion
      ? 0
      : withRepeat(
          withTiming(1, { duration: Motion.spinMs, easing: Easing.linear }),
          -1,
          false
        );
  }, [reduceMotion, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: BUFFER_CIRCUMFERENCE * (1 - spin.value),
  }));

  const size = scale(PLAY_SIZE) + BUFFER_STROKE * 2 + 2;

  return (
    <Animated.View pointerEvents="none" style={[styles.bufferArc, spinStyle]}>
      <Svg width={size} height={size}>
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={BUFFER_RADIUS}
          fill="none"
          stroke={Colors.textOnSignal}
          strokeWidth={BUFFER_STROKE}
          strokeLinecap="round"
          strokeDasharray={BUFFER_ARC}
          animatedProps={arcProps}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Play and pause cross-fade instead of swapping. The icon sits on the most
 * pressed control in the app, and an instant glyph swap reads as a flicker; the
 * small scale ramp gives the change somewhere to come from.
 */
function PlayPauseIcon({ isPlaying }: { isPlaying: boolean }) {
  const playOpacity = useSharedValue(isPlaying ? 0 : 1);
  const pauseOpacity = useSharedValue(isPlaying ? 1 : 0);

  useEffect(() => {
    playOpacity.value = withTiming(isPlaying ? 0 : 1, { duration: Durations.fast });
    pauseOpacity.value = withTiming(isPlaying ? 1 : 0, { duration: Durations.fast });
  }, [isPlaying, pauseOpacity, playOpacity]);

  const playStyle = useAnimatedStyle(() => ({
    opacity: playOpacity.value,
    transform: [{ scale: 0.82 + playOpacity.value * 0.18 }],
  }));

  const pauseStyle = useAnimatedStyle(() => ({
    opacity: pauseOpacity.value,
    transform: [{ scale: 0.82 + pauseOpacity.value * 0.18 }],
  }));

  return (
    <View style={styles.iconStack}>
      <Animated.View
        pointerEvents="none"
        style={[styles.iconLayer, styles.playIconLayer, playStyle]}
      >
        <Ionicons name="play" size={scale(34)} color={Colors.textOnSignal} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.iconLayer, pauseStyle]}>
        <Ionicons name="pause" size={scale(34)} color={Colors.textOnSignal} />
      </Animated.View>
    </View>
  );
}

interface PlayerControlsProps {
  isPlaying: boolean;
  isBuffering: boolean;
  isFavorite: boolean;
  onTogglePlay: () => void;
  onToggleFavorite: () => void;
  onShare: () => void;
}

function PlayerControlsImpl({
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
        {isBuffering ? <BufferingArc /> : <PlayPauseIcon isPlaying={isPlaying} />}
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

export const PlayerControls = memo(PlayerControlsImpl);

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
  bufferArc: {
    position: 'absolute',
    top: -(BUFFER_STROKE + 1),
    left: -(BUFFER_STROKE + 1),
  },
  iconStack: {
    width: scale(34),
    height: scale(34),
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The play triangle reads optically off-centre inside the circle; the pause
  // bars are symmetric and need no nudge.
  playIconLayer: { left: scale(3), right: -scale(3) },
});
