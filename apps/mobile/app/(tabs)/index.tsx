import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VinylDisc } from '@/components/VinylDisc';
import { PlayerControls } from '@/components/PlayerControls';
import { SleepTimerModal } from '@/components/SleepTimerModal';
import { FacebookLivePlayer } from '@/components/FacebookLivePlayer';
import { BiblePanel } from '@/components/bible/BiblePanel';
import { NotificationsModal } from '@/components/NotificationsModal';
import { ConnectionBanner } from '@/components/player/ConnectionBanner';
import { PlayerTopBar } from '@/components/player/PlayerTopBar';
import { ReminderBanner } from '@/components/player/ReminderBanner';
import { NowPlayingInfo } from '@/components/player/NowPlayingInfo';
import { SleepTimerRow } from '@/components/player/SleepTimerRow';
import { NextUpCard } from '@/components/player/NextUpCard';
import { useAzuraCast } from '@radio/api';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useFacebookLive } from '@/hooks/useFacebookLive';
import { useSleepTimer } from '@/hooks/useSleepTimer';
import { useProgramNotify } from '@/hooks/useProgramNotify';
import { useNotificationReminder } from '@/hooks/useNotificationReminder';
import {
  useFavoriteNotify,
  loadFavoriteSongKeys,
  saveFavoriteSongKeys,
} from '@/hooks/useFavoriteNotify';
import { BACKEND_URL } from '@/constants/api';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { formatMediaTitle } from '@/lib/formatMedia';
import LOGO from '@assets/img/LOGO_COMPLETO_SINFONDO2.png';

import { TAB_BAR_HEIGHT } from '../../lib/responsive';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const VINYL_SIZE = Math.min(SCREEN_WIDTH * 0.62, (SCREEN_HEIGHT - 260) * 0.6, 232);
// Keeps the play controls clear of the tab bar while staying compact on short screens
const BOTTOM_CONTROLS_PADDING = TAB_BAR_HEIGHT + Spacing.md - 60;

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, error, getStreamUrl } = useAzuraCast({
    apiBaseUrl: BACKEND_URL,
    pollInterval: 3000,
  });

  const song = data?.now_playing?.song;
  const { title, artist, isPreaching } = formatMediaTitle(
    song?.title ?? '',
    song?.artist ?? '',
  );
  const artworkUri = song?.art ?? null;

  const streamUrl = getStreamUrl('128');

  const { isPlaying, isBuffering, error: audioError, reconnectAttempt, toggle, pause } =
    useAudioPlayer({
      streamUrl,
      title,
      artist,
      artwork: artworkUri,
    });

  const { liveUrl } = useFacebookLive();

  const [showBible, setShowBible] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [showNotifyMenu, setShowNotifyMenu] = useState(false);

  const sleepTimer = useSleepTimer(useCallback(async () => {
    await pause();
  }, [pause]));

  const { exactAlarmGranted } = useProgramNotify();

  const [favoriteSongKeys, setFavoriteSongKeys] = useState<string[]>([]);

  useEffect(() => {
    loadFavoriteSongKeys().then(setFavoriteSongKeys);
  }, []);

  const currentSongKey = song
    ? `${song.artist}::${song.title}`.toLowerCase()
    : null;
  const isFavorite = currentSongKey
    ? favoriteSongKeys.some((k) => k.toLowerCase() === currentSongKey)
    : false;

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

  const { showReminder, dismissReminder } = useNotificationReminder();
  const [showTooltip, setShowTooltip] = useState(false);

  const handleDismissReminder = useCallback(() => {
    dismissReminder();
    setShowTooltip(true);
    setTimeout(() => {
      setShowTooltip(false);
    }, 4000);
  }, [dismissReminder]);

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
          'Para saber cuando suene tu música favorita o un programa necesitamos el permiso.',
          [{ text: 'Entendido', style: 'default' }]
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

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.topSection, { paddingTop: insets.top + Spacing.sm }]}>
          <ConnectionBanner reconnectAttempt={reconnectAttempt} error={audioError} />

          <PlayerTopBar
            notifyEnabled={notifyEnabled}
            sleepTimerActive={sleepTimer.isActive}
            sleepTimerDisplay={sleepTimer.display}
            showTooltip={showTooltip}
            listenersCount={listenersCount}
            onOpenNotifications={() => {
              setShowTooltip(false);
              setShowNotifyMenu(true);
            }}
            onOpenSleepTimer={() => setShowSleepMenu(true)}
          />

          {showReminder && (
            <ReminderBanner
              onDismiss={handleDismissReminder}
              onConfigure={() => {
                dismissReminder();
                setShowNotifyMenu(true);
              }}
            />
          )}

          <Image
            source={LOGO}
            style={styles.logo}
            resizeMode="contain"
          />

          <TouchableOpacity
            style={styles.bibleButton}
            onPress={() => setShowBible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="book" size={18} color="#fff" />
            <Text style={styles.bibleButtonText}>Biblia</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.centerSection}>
          {liveUrl ? (
            <FacebookLivePlayer liveUrl={liveUrl} />
          ) : (
            <View style={styles.vinylWrapper}>
              <View style={styles.vinylGlow} />
              <VinylDisc
                artworkUri={artworkUri}
                isPlaying={isPlaying || isBuffering}
                size={VINYL_SIZE}
              />
            </View>
          )}

          <NowPlayingInfo title={title} artist={artist} isPreaching={isPreaching} />

          {sleepTimer.isActive && (
            <SleepTimerRow display={sleepTimer.display} onCancel={sleepTimer.cancel} />
          )}

          {data?.playing_next && <NextUpCard song={data.playing_next.song} />}
        </View>
      </ScrollView>

      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + BOTTOM_CONTROLS_PADDING }]}>
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

      <NotificationsModal
        visible={showNotifyMenu}
        onClose={() => setShowNotifyMenu(false)}
        notifyEnabled={notifyEnabled}
        onToggleCurrent={handleToggleNotify}
        currentSongTitle={title}
        exactAlarmGranted={exactAlarmGranted}
      />

      <BiblePanel isOpen={showBible} onClose={() => setShowBible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Allow ScrollView to take available space
  scrollContainer: {
    flex: 1,
  },
  // Ensure child content stretches correctly and adds padding at the end
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xl,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    gap: Spacing.md,
  },
  loadingText: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.sm },
  errorText: { ...Typography.body, color: Colors.danger, textAlign: 'center', maxWidth: 280 },

  topSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  bibleButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.full,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  bibleButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  logo: {
    width: 190,
    height: 84,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },

  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },

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

  bottomSection: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: 'rgba(12,12,30,0.95)',
  },
});
