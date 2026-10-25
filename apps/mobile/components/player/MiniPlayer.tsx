import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { State, usePlaybackState } from 'react-native-track-player';
import { Image as ExpoImage } from 'expo-image';
import TrackPlayer from 'react-native-track-player';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { tick } from '@/lib/haptics';

/**
 * Mini reproductor persistente. Aparece encima de la barra de pestañas cuando
 * el stream está sonando, en cualquier pestaña que no sea En vivo. Tocarlo
 * navega de vuelta a En vivo con una transición compartida.
 *
 * Lee el estado de reproducción de Track Player y la metadata del track
 * actual (título, artista, carátula) para mostrar el control básico.
 */
export function MiniPlayer({ onPress }: { onPress: () => void }) {
  const playbackState = usePlaybackState();
  const isPlaying = playbackState.state === State.Playing;
  const [track, setTrack] = useState<{
    title?: string | null;
    artist?: string | null;
    artwork?: string | null;
  }>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      const t = await TrackPlayer.getTrack(1);
      if (!mounted) return;
      setTrack({
        title: t?.title ?? null,
        artist: t?.artist ?? null,
        artwork: t?.artwork ?? null,
      });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (!isPlaying) return null;

  return (
    <TouchableOpacity
      onPress={() => {
        tick();
        onPress();
      }}
      style={styles.container}
      activeOpacity={0.8}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={`Mini reproductor: ${track.title ?? 'La Voz de la Verdad'}`}
      accessibilityHint="Toca para volver a la pantalla En vivo"
    >
      <View style={styles.artWrap}>
        {track.artwork ? (
          <ExpoImage
            source={{ uri: track.artwork }}
            style={styles.art}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.artFallback} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title ?? 'La Voz de la Verdad'}
        </Text>
        {track.artist ? (
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        ) : null}
      </View>
      <View style={styles.pauseWrap}>
        <View style={styles.pauseBar} />
        <View style={styles.pauseBar} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.scrimStrong,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderGlass,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 56,
    gap: Spacing.md,
  },
  artWrap: {
    width: 36,
    height: 36,
    borderRadius: Radii.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  art: {
    width: '100%',
    height: '100%',
  },
  artFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surfaceSoft,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...Typography.bodyStrong,
    color: Colors.text,
    fontSize: 14,
    lineHeight: 18,
  },
  artist: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  pauseWrap: {
    width: 32,
    alignItems: 'center',
  },
  pauseBar: {
    width: 6,
    height: 24,
    borderRadius: 3,
    backgroundColor: Colors.text,
    marginHorizontal: 1,
  },
});
