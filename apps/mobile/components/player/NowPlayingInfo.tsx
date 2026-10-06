import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import TextTicker from 'react-native-text-ticker';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { Durations, Easings, Motion } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface NowPlayingInfoProps {
  title: string;
  artist: string;
  isPreaching: boolean;
}

/**
 * The live badge dot breathes like the tab-bar LiveDot. "Prédica · En vivo" is
 * the app explaining why the stream behaves differently, so the dot carrying a
 * pulse is what makes the badge read as live rather than as a static label.
 */
function PreachingDot() {
  const reduceMotion = useReducedMotion();
  const halo = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      halo.value = 0;
      return;
    }
    halo.value = withRepeat(
      withTiming(1, { duration: Motion.haloPulseMs, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
  }, [halo, reduceMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + halo.value * 0.9 }],
    opacity: 0.6 * (1 - halo.value),
  }));

  return (
    <View style={styles.preachingDotWrap} accessible={false} importantForAccessibility="no-hide-descendants">
      {!reduceMotion && <Animated.View style={[styles.preachingHalo, haloStyle]} />}
      <View style={styles.preachingDot} />
    </View>
  );
}

function NowPlayingInfoImpl({ title, artist, isPreaching }: NowPlayingInfoProps) {
  const reduceMotion = useReducedMotion();

  // Ticker solo si el texto desborda y el usuario no pidió reducir movimiento.
  const titleLooksLong = !reduceMotion && title.length > 28;
  const artistLooksLong = !reduceMotion && artist.length > 30;
  const accessibilityLabel = isPreaching
    ? `Prédica en vivo: ${title}, ${artist}`
    : `Sonando ahora: ${title}, ${artist}`;

  // A pure cross-fade leaves the eye with nothing to track when the song
  // changes. Giving the swap a direction — the old line lifts away while the new
  // one rises into place — makes the change legible as "the station moved on".
  // Under Reduce Motion the direction is dropped and only the fade remains.
  const enter = reduceMotion
    ? FadeIn.duration(Durations.fast)
    : FadeInDown.duration(Durations.normal).easing(Easing.bezier(...Easings.enter));
  const exit = reduceMotion
    ? FadeOut.duration(Durations.instant)
    : FadeOutUp.duration(Durations.fast).easing(Easing.bezier(...Easings.exit));
  const enterArtist = reduceMotion
    ? FadeIn.duration(Durations.fast)
    : FadeInDown.delay(Motion.entryStaggerMs).duration(Durations.normal).easing(Easing.bezier(...Easings.enter));

  return (
    <View style={styles.songInfo} accessible accessibilityRole="text" accessibilityLabel={accessibilityLabel} accessibilityLiveRegion="polite">
      {isPreaching && (
        <Animated.View
          entering={FadeIn.duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
          exiting={FadeOut.duration(Durations.fast)}
          style={styles.preachingBadge}
        >
          <PreachingDot />
          <Text style={styles.preachingBadgeText}>Prédica · En vivo</Text>
        </Animated.View>
      )}
      <Animated.View
        key={`title-${title}`}
        entering={enter}
        exiting={exit}
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
          entering={enterArtist}
          exiting={exit}
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

export const NowPlayingInfo = memo(NowPlayingInfoImpl);

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
    borderColor: Colors.signalGlow,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
  },
  preachingDotWrap: {
    width: 6,
    height: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preachingHalo: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.signal,
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
