import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  Dimensions,
  Image,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VinylDisc } from '@/components/VinylDisc';
import { LiveBadge } from '@/components/LiveBadge';
import { PlayerControls } from '@/components/PlayerControls';
import { SleepTimerModal } from '@/components/SleepTimerModal';
import { FacebookLivePlayer } from '@/components/FacebookLivePlayer';
import { BiblePanel } from '@/components/bible/BiblePanel';
import { NotificationsModal } from '@/components/NotificationsModal';
import TextTicker from 'react-native-text-ticker';
import { useAzuraCast } from '@radio/api';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useFacebookLive } from '@/hooks/useFacebookLive';
import { useSleepTimer } from '@/hooks/useSleepTimer';
import { useProgramNotify, debugFireNextNotification } from '@/hooks/useProgramNotify';
import { useNotificationReminder } from '@/hooks/useNotificationReminder';
import {
  useFavoriteNotify,
  loadFavoriteSongKeys,
  saveFavoriteSongKeys,
} from '@/hooks/useFavoriteNotify';
import { BACKEND_URL } from '@/constants/api';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { formatMediaTitle } from '@/lib/formatMedia';
// @ts-ignore
import LOGO from '@assets/img/LOGO_COMPLETO_SINFONDO2.png';

import { scale, verticalScale, TAB_BAR_HEIGHT } from '../../lib/responsive';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const VINYL_SIZE = Math.min(SCREEN_WIDTH * 0.62, (SCREEN_HEIGHT - 260) * 0.6, 232);

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, error, getStreamUrl, fetchSchedule } = useAzuraCast({
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

  useProgramNotify();

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

      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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
            <View style={{ zIndex: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setShowTooltip(false);
                  setShowNotifyMenu(true);
                }} 
                style={styles.iconButton}
                activeOpacity={0.7}
                accessibilityLabel="Configurar notificaciones"
              >
                <Ionicons
                  name={notifyEnabled ? 'notifications' : 'notifications-outline'}
                  size={20}
                  color={notifyEnabled ? Colors.accent : Colors.textFaint}
                />
              </TouchableOpacity>

              {showTooltip && (
                <View style={styles.tooltipContainer}>
                  <View style={styles.tooltipArrow} />
                  <Text style={styles.tooltipText}>Configúralo aquí cuando desees</Text>
                </View>
              )}
            </View>

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

          {showReminder && (
            <View style={styles.reminderBanner}>
              <View style={styles.reminderContent}>
                <Ionicons name="notifications" size={20} color={Colors.accent} />
                <View style={styles.reminderTextContainer}>
                  <Text style={styles.reminderTitle}>No te pierdas de nada</Text>
                  <Text style={styles.reminderBody}>Configura alertas para tus programas favoritos.</Text>
                </View>
              </View>
              <View style={styles.reminderActions}>
                <TouchableOpacity onPress={handleDismissReminder} style={styles.reminderButton}>
                  <Text style={styles.reminderButtonTextFaint}>Luego</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.reminderButtonAccent}
                  onPress={() => {
                    dismissReminder();
                    setShowNotifyMenu(true);
                  }}
                >
                  <Text style={styles.reminderButtonText}>Configurar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <Image
            source={LOGO}
            style={{ width: 190, height: 84, alignSelf: 'center', marginBottom: Spacing.sm }}
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
              
              <View style={styles.nextTickerContainer}>
                <TextTicker
                  duration={8000}
                  loop
                  bounce={false}
                  repeatSpacer={50}
                  marqueeDelay={2000}
                >
                  <Text style={styles.nextArtist}>
                    {formatMediaTitle(data.playing_next.song.title, data.playing_next.song.artist).artist}
                  </Text>
                  <Text style={styles.nextSeparator}> · </Text>
                  <Text style={styles.nextTitle}>
                    {formatMediaTitle(data.playing_next.song.title, data.playing_next.song.artist).title}
                  </Text>
                </TextTicker>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomSection,
          { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + Spacing.md - 60},
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

      <NotificationsModal
        visible={showNotifyMenu}
        onClose={() => setShowNotifyMenu(false)}
        notifyEnabled={notifyEnabled}
        onToggleCurrent={handleToggleNotify}
        currentSongTitle={title}
      />

      <BiblePanel 
        isOpen={showBible} 
        onClose={() => setShowBible(false)} 
      />
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

  songInfo: {
    alignItems: 'center',
    gap: Spacing.xs,
    width: '100%',
    paddingHorizontal: Spacing.sm,
  },
  songTitle: { ...Typography.songTitle, color: Colors.text, textAlign: 'center' },
  artistName: { ...Typography.artistName, color: Colors.textMuted, textAlign: 'center' },
  albumName: { ...Typography.albumName, color: Colors.textFaint, textAlign: 'center' },

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

  reminderBanner: {
    backgroundColor: Colors.surfaceElevated,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radii.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reminderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  reminderTextContainer: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  reminderTitle: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  reminderBody: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  reminderActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  reminderButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  reminderButtonTextFaint: {
    ...Typography.caption,
    color: Colors.textFaint,
    fontWeight: '500',
  },
  reminderButtonAccent: {
    backgroundColor: Colors.accentMuted,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
    justifyContent: 'center',
  },
  reminderButtonText: {
    ...Typography.caption,
    color: Colors.accent,
    fontWeight: '600',
  },
  tooltipContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radii.sm,
    width: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  tooltipArrow: {
    position: 'absolute',
    top: -6,
    left: 12,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: Colors.accent,
  },
  tooltipText: {
    ...Typography.caption,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
});