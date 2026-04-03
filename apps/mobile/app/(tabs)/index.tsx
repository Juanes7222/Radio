import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Dimensions,
  Platform,
  Image,
  Alert,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VinylDisc } from '@/components/VinylDisc';
import { LiveBadge } from '@/components/LiveBadge';
import { PlayerControls } from '@/components/PlayerControls';
import { SleepTimerModal } from '@/components/SleepTimerModal';
import TextTicker from 'react-native-text-ticker';
import { useAzuraCast } from '@radio/api';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useSleepTimer } from '@/hooks/useSleepTimer';
import { useProgramNotify } from '@/hooks/useProgramNotify';
import {
  useFavoriteNotify,
  loadFavoriteSongKeys,
  saveFavoriteSongKeys,
} from '@/hooks/useFavoriteNotify';
import { BACKEND_URL } from '@/constants/api';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { formatMediaTitle } from '@/lib/formatMedia';
import LOGO from '@assets/img/LOGO_COMPLETO_SINFONDO2.png';

import { scale, verticalScale, TAB_BAR_HEIGHT } from '../../lib/responsive';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Reserve ~260pt for top bar + song info + controls + tab bar
const VINYL_SIZE = Math.min(SCREEN_WIDTH * 0.62, (SCREEN_HEIGHT - 260) * 0.6, 232);

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, error } = useAzuraCast({
    apiBaseUrl: BACKEND_URL,
    pollInterval: 3000,
  });

  const { isPlaying, isBuffering, error: audioError, reconnectAttempt, toggle, pause } =
    useAudioPlayer({ streamUrl: data?.station?.listen_url ?? '' });

  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const sleepTimer = useSleepTimer(useCallback(async () => {
    await pause();
  }, [pause]));

  useProgramNotify();

  const [favoriteSongKeys, setFavoriteSongKeys] = useState<string[]>([]);

  useEffect(() => {
    loadFavoriteSongKeys().then(setFavoriteSongKeys);
  }, []);

  const song = data?.now_playing?.song;
  const currentSongKey = song
    ? `${song.artist}::${song.title}`.toLowerCase()
    : null;
  const isFavorite = currentSongKey
    ? favoriteSongKeys.some((k) => k.toLowerCase() === currentSongKey)
    : false;

  const { title, artist, isPreaching } = formatMediaTitle(
    song?.title ?? '',
    song?.artist ?? '',
  );

  const toggleFavorite = useCallback(async () => {
    if (!currentSongKey) return;
    const next = isFavorite
      ? favoriteSongKeys.filter((k) => k.toLowerCase() !== currentSongKey)
      : [...favoriteSongKeys, currentSongKey];
    setFavoriteSongKeys(next);
    await saveFavoriteSongKeys(next);
  }, [currentSongKey, isFavorite, favoriteSongKeys]);

  const currentSongForNotify = song
    ? { id: song.id, title: song.title, artist: song.artist, art: song.art }
    : null;
  const { isEnabled: notifyEnabled, enable: enableNotify, disable: disableNotify } =
    useFavoriteNotify(currentSongForNotify, favoriteSongKeys);

  const artworkUri = song?.art ?? null;
  const listenersCount = data?.listeners?.current ?? 0;

  const handleToggleNotify = useCallback(async () => {
    if (notifyEnabled) {
      disableNotify();
      return;
    }
    const { granted, canAskAgain } = await enableNotify();
    if (!granted) {
      if (!canAskAgain) {
        Alert.alert(
          'Activar notificaciones',
          'Has denegado las notificaciones. Para recibir alertas cuando suene una canción favorita, activa los permisos en los ajustes de la aplicación.',
          [
            { text: 'Ahora no', style: 'cancel' },
            { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert(
          'Notificaciones necesarias',
          'Para saber cuando suene tu música favorita necesitamos el permiso de notificaciones.',
          [
            { text: 'Entendido', style: 'default' }
          ]
        );
      }
    }
  }, [notifyEnabled, enableNotify, disableNotify]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <LinearGradient
          colors={['#080810', '#120820', '#080810']}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Conectando con la emisora…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <LinearGradient
          colors={['#080810', '#120820', '#080810']}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="wifi-outline" size={52} color={Colors.danger} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0c0c1e', '#13102a', '#0c0c1e']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Seccion superior */}
      <View style={[styles.topSection, { paddingTop: insets.top + Spacing.sm }]}>
        {(reconnectAttempt > 0 || audioError) && (
          <View style={[
            styles.banner,
            reconnectAttempt > 0 ? styles.bannerAmber : styles.bannerRed,
          ]}>
            {reconnectAttempt > 0 && (
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.bannerText} numberOfLines={2}>
              {audioError ?? 'Reconectando…'}
            </Text>
          </View>
        )}

        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={handleToggleNotify}
            style={styles.iconButton}
            activeOpacity={0.7}
            accessibilityLabel={notifyEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
          >
            <Ionicons
              name={notifyEnabled ? 'notifications' : 'notifications-off-outline'}
              size={20}
              color={notifyEnabled ? Colors.accent : Colors.textFaint}
            />
          </TouchableOpacity>

          <LiveBadge listenersCount={listenersCount} />

          <TouchableOpacity
            onPress={() => setShowSleepMenu(true)}
            style={[styles.iconButton, sleepTimer.isActive && styles.iconButtonActive]}
            activeOpacity={0.7}
            accessibilityLabel="Temporizador de apagado"
          >
            <Ionicons
              name="timer-outline"
              size={20}
              color={sleepTimer.isActive ? Colors.warning : Colors.textFaint}
            />
            {sleepTimer.isActive && (
              <Text style={styles.timerBadge}>{sleepTimer.display}</Text>
            )}
          </TouchableOpacity>
        </View>

        <Image
          source={LOGO}
          style={{ width: 190, height: 84, alignSelf: 'center', marginBottom: Spacing.sm }}
          resizeMode="contain"
        />

      </View>

      {/* Seccion central: vinilo + info */}
      <View style={styles.centerSection}>
        <View style={styles.vinylWrapper}>
          <View style={styles.vinylGlow} />
          <VinylDisc
            artworkUri={artworkUri}
            isPlaying={isPlaying || isBuffering}
            size={VINYL_SIZE}
          />
        </View>

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
          {/* {song?.album ? (
            <TextTicker
              style={styles.albumName}
              duration={8000}
              loop
              bounce={false}
              repeatSpacer={50}
              marqueeDelay={2000}
            >
              {song.album}
            </TextTicker>
          ) : null} */}
        </View>

        {sleepTimer.isActive && (
          <View style={styles.sleepRow}>
            <Ionicons name="timer-outline" size={14} color={Colors.warning} />
            <Text style={styles.sleepText}>Apagado en {sleepTimer.display}</Text>
            <Pressable
              onPress={sleepTimer.cancel}
              style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        )}

        {data?.playing_next && (
          <View style={styles.nextCard}>
            <Ionicons name="play-skip-forward" size={13} color={Colors.accent} />
            <Text style={styles.nextLabel}>A continuación: </Text>
            <Text style={styles.nextArtist} numberOfLines={1}>
              {formatMediaTitle(data.playing_next.song.title, data.playing_next.song.artist).artist}
            </Text>
            <Text style={styles.nextSeparator}>·</Text>
            <Text style={styles.nextTitle} numberOfLines={1}>
              {formatMediaTitle(data.playing_next.song.title, data.playing_next.song.artist).title}
            </Text>
          </View>
        )}
      </View>

      {/* Seccion inferior: controles */}
      <View
        style={[
          styles.bottomSection,
          { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + Spacing.md },
        ]}
      >
        <PlayerControls
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          isFavorite={isFavorite}
          onTogglePlay={toggle}
          onToggleFavorite={toggleFavorite}
        />
      </View>

      <SleepTimerModal
        visible={showSleepMenu}
        isTimerActive={sleepTimer.isActive}
        onClose={() => setShowSleepMenu(false)}
        onSelectPreset={(minutes) => {
          sleepTimer.start(minutes);
          setShowSleepMenu(false);
        }}
        onCancel={() => {
          sleepTimer.cancel();
          setShowSleepMenu(false);
        }}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    gap: Spacing.md,
  },
  loadingText: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.sm },
  errorText: { ...Typography.body, color: Colors.danger, textAlign: 'center', maxWidth: 280 },

  // ── Banners ──────────────────────────────────────────────────
  banner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radii.md,
    marginBottom: Spacing.sm,
  },
  bannerAmber: { backgroundColor: 'rgba(146,64,14,0.85)' },
  bannerRed: { backgroundColor: 'rgba(127,29,29,0.85)' },
  bannerText: { color: '#fef3c7', fontSize: 13, flex: 1 },

  // ── Top section ──────────────────────────────────────────────
  topSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.sm,
  },
  iconButton: {
    padding: 10,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconButtonActive: { backgroundColor: Colors.warningMuted },
  timerBadge: { ...Typography.caption, color: Colors.warning, fontWeight: '700' },
  stationName: { ...Typography.screenTitle, color: Colors.textMuted, textAlign: 'center' },

  // ── Center section ───────────────────────────────────────────
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },

  // ── Vinyl ────────────────────────────────────────────────────
  vinylWrapper: {
    width: VINYL_SIZE,
    height: VINYL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vinylGlow: {
    position: 'absolute',
    width: VINYL_SIZE * 0.9,
    height: VINYL_SIZE * 0.9,
    borderRadius: VINYL_SIZE / 2,
    backgroundColor: Colors.accentGlow,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 40,
    elevation: 20,
  },

  // ── Song info ────────────────────────────────────────────────
  songInfo: {
    alignItems: 'center',
    gap: Spacing.xs,
    width: '100%',
    paddingHorizontal: Spacing.sm,
  },
  songTitle: { ...Typography.songTitle, color: Colors.text, textAlign: 'center' },
  artistName: { ...Typography.artistName, color: Colors.textMuted, textAlign: 'center' },
  albumName: { ...Typography.albumName, color: Colors.textFaint, textAlign: 'center' },

  // ── Sleep row ────────────────────────────────────────────────
  sleepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warningMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radii.md,
    width: '100%',
  },
  sleepText: { ...Typography.body, color: Colors.warning, flex: 1 },
  cancelButton: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radii.sm,
  },
  cancelButtonText: { ...Typography.caption, color: Colors.warning, fontWeight: '600' },

  // ── Next card ────────────────────────────────────────────────
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

  // ── Bottom section: controles ────────────────────────────────
  bottomSection: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: 'rgba(12,12,30,0.95)',
  },

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





