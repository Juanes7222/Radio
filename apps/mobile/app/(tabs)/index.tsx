import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
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
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, Easing } from 'react-native-reanimated';
import { ShimmerBox } from '@/components/ui/Shimmer';
import { DialVivo } from '@/components/player/DialVivo';
import { PlayerControls } from '@/components/PlayerControls';
import { SleepTimerModal } from '@/components/SleepTimerModal';
import { FacebookLivePlayer } from '@/components/FacebookLivePlayer';
import { BiblePanel } from '@/components/bible/BiblePanel';
import { NotificationsModal } from '@/components/NotificationsModal';
import { ConnectionBanner } from '@/components/player/ConnectionBanner';
import { PlayerTopBar } from '@/components/player/PlayerTopBar';
import { QualityModal } from '@/components/QualityModal';
import { useStreamQuality } from '@/hooks/useStreamQuality';
import type { StreamQuality } from '@radio/types';
// Recordatorios deshabilitados temporalmente - codigo conservado en components/player/ReminderBanner.tsx
// import { ReminderBanner } from '@/components/player/ReminderBanner';
import { NowPlayingInfo } from '@/components/player/NowPlayingInfo';
import { SleepTimerRow } from '@/components/player/SleepTimerRow';
import { NextUpCard } from '@/components/player/NextUpCard';
import { useAzuraCast } from '@radio/api';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { State, usePlaybackState } from 'react-native-track-player';
import { AppState } from 'react-native';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useFacebookLive } from '@/hooks/useFacebookLive';
import { useSleepTimer } from '@/hooks/useSleepTimer';
import { useProgramNotify } from '@/hooks/useProgramNotify';
// import { useNotificationReminder } from '@/hooks/useNotificationReminder'; // deshabilitado
import { useAlarmClock } from '@/hooks/useAlarmClock';
import { AlarmModal } from '@/components/AlarmModal';
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
const BOTTOM_CONTROLS_PADDING = TAB_BAR_HEIGHT + Spacing.xs - 60;

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();

  const [appActive, setAppActive] = useState(true);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const playbackState = usePlaybackState();
  const isPlayingNow = playbackState.state === State.Playing;

  // The realtime now-playing connection is only useful while the screen is
  // visible or while audio keeps playing (to refresh the notification
  // metadata). It is suspended when the app is backgrounded and paused.
  const realtimeEnabled = appActive || isPlayingNow;

  const { data, isLoading, error, getStreamUrl } = useAzuraCast({
    apiBaseUrl: BACKEND_URL,
    pollInterval: 5000,
    enabled: realtimeEnabled,
  });

  const song = data?.now_playing?.song;
  const { title, artist, isPreaching } = formatMediaTitle(
    song?.title ?? '',
    song?.artist ?? '',
  );
  const artworkUri = song?.art ?? null;

  const availableQualities = useMemo<StreamQuality[]>(() => {
    const bitrates = new Set((data?.station.mounts ?? []).map((m) => m.bitrate));
    return (['64', '128', '320'] as StreamQuality[]).filter((q) => bitrates.has(Number(q)));
  }, [data]);

  const { quality, setQuality } = useStreamQuality(availableQualities);
  const streamUrl = getStreamUrl(quality);

  const { isPlaying, isBuffering, error: audioError, reconnectAttempt, toggle, pause, play } =
    useAudioPlayer({
      streamUrl,
      title,
      artist,
      artwork: artworkUri,
    });

  const { liveUrl } = useFacebookLive();

  useEffect(() => {
    if (liveUrl) {
      pause();
    }
  }, [liveUrl, pause]);

  const [showBible, setShowBible] = useState(false);
  const [bibleOpened, setBibleOpened] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [showNotifyMenu, setShowNotifyMenu] = useState(false);
  const [showAlarmMenu, setShowAlarmMenu] = useState(false);

  const { alarms, saveAlarm, updateAlarm, removeAlarm, toggleAlarm } = useAlarmClock();

  const { autoplay } = useLocalSearchParams<{ autoplay?: string }>();
  const autoplayHandledRef = useRef(false);

  // Alarm notification tapped while app was closed: start the stream.
  useEffect(() => {
    if (autoplay !== '1' || autoplayHandledRef.current) return;
    autoplayHandledRef.current = true;
    if (!liveUrl) {
      play();
    }
  }, [autoplay, liveUrl, play]);

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

  // Recordatorios deshabilitados - hook conservado en hooks/useNotificationReminder.ts
  // const { showReminder, dismissReminder, dismissReminderForever } = useNotificationReminder();
  const [showTooltip, setShowTooltip] = useState(false);

  // const handleDismissReminder = useCallback(() => { dismissReminder(); setShowTooltip(true); setTimeout(() => setShowTooltip(false), 4000); }, [dismissReminder]);

  const listenersCount = data?.listeners?.current ?? 0;

  const handleShare = useCallback(async () => {
    // The stream URL is not useful for sharing: the Play Store link promotes
    // the app itself and points Android users to a real install.
    const appLink = 'https://play.google.com/store/apps/details?id=com.lavozverdad.radio';
    const message = title
      ? `Estoy escuchando "${title}" de ${artist} en vivo en La Voz de la Verdad.\n\nDescarga la app gratis y escúchala donde quieras:\n${appLink}`
      : `Estoy escuchando La Voz de la Verdad en vivo.\n\nDescarga la app gratis y escúchala donde quieras:\n${appLink}`;
    await Share.share({ message });
  }, [title, artist]);

  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const wasPlayingRef = useRef(false);
  useEffect(() => {
    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Restart the stream with the new mount when the quality changes while playing.
  const prevQualityRef = useRef<StreamQuality | null>(null);
  useEffect(() => {
    if (prevQualityRef.current !== null && prevQualityRef.current !== quality) {
      if (wasPlayingRef.current) {
        play();
      }
    }
    prevQualityRef.current = quality;
  }, [quality, play]);

  const handleQualitySelect = useCallback(
    (next: StreamQuality) => {
      setQuality(next);
      setShowQualityMenu(false);
    },
    [setQuality],
  );

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
          colors={[Colors.ink, Colors.inkSoft, Colors.ink]}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View entering={FadeIn.duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}>
          <View style={styles.loadingHalo} />
        </Animated.View>
        <ActivityIndicator size="large" color={Colors.signal} />
        <Text style={styles.loadingText}>Conectando con la emisora…</Text>
        <Animated.View
          entering={FadeInDown.delay(120).duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          style={styles.skeletonRow}
        >
          <ShimmerBox style={styles.skeletonLine} borderRadius={6} />
          <ShimmerBox style={[styles.skeletonLine, styles.skeletonLineShort]} borderRadius={6} />
        </Animated.View>
      </View>
    );
  }

  if (error) {
    return (
      <Animated.View
        entering={FadeIn.duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
        style={styles.center}
      >
        <LinearGradient
          colors={[Colors.ink, Colors.inkSoft, Colors.ink]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.errorIconWrap}>
          <Ionicons name="wifi-outline" size={40} color={Colors.tally} />
        </View>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorHint}>Reintentamos automáticamente cuando vuelva la señal</Text>
      </Animated.View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.ink, Colors.inkSoft, Colors.ink]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInDown.duration(300).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          style={[styles.topSection, { paddingTop: insets.top + Spacing.sm }]}
        >
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
            onOpenAlarm={() => setShowAlarmMenu(true)}
          />

          <Animated.View
            entering={FadeInDown.delay(60).duration(300).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          >
            <Image
              source={LOGO}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(110).duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          >
            <TouchableOpacity
              style={styles.bibleButton}
              onPress={() => {
                setBibleOpened(true);
                setShowBible(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="book" size={18} color="#fff" />
              <Text style={styles.bibleButtonText}>Biblia</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(160).duration(340).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          style={styles.centerSection}
        >
          <Animated.View
            entering={FadeIn.duration(380).delay(180).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          >
            {liveUrl ? (
              <FacebookLivePlayer liveUrl={liveUrl} />
            ) : (
              <DialVivo
                artworkUri={artworkUri}
                isPlaying={(isPlaying || isBuffering) && isFocused}
                isPreaching={isPreaching}
                size={VINYL_SIZE}
              />
            )}
          </Animated.View>

          <NowPlayingInfo title={title} artist={artist} isPreaching={isPreaching} />

          {sleepTimer.isActive && (
            <SleepTimerRow display={sleepTimer.display} onCancel={sleepTimer.cancel} />
          )}

          {data?.playing_next && <NextUpCard song={data.playing_next.song} active={isFocused} />}
        </Animated.View>
      </ScrollView>

      <Animated.View
        entering={FadeInDown.delay(220).duration(320).easing(Easing.bezier(0.16, 1, 0.3, 1))}
        style={[styles.bottomSection, { paddingBottom: insets.bottom + BOTTOM_CONTROLS_PADDING }]}
      >
        <PlayerControls
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          isFavorite={isFavorite}
          onTogglePlay={toggle}
          onToggleFavorite={toggleFavorite}
          onShare={handleShare}
        />
      </Animated.View>

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

      <QualityModal
        visible={showQualityMenu}
        currentQuality={quality}
        availableQualities={availableQualities.length > 0 ? availableQualities : ['128']}
        onClose={() => setShowQualityMenu(false)}
        onSelect={handleQualitySelect}
      />

      <AlarmModal
        visible={showAlarmMenu}
        alarms={alarms}
        onClose={() => setShowAlarmMenu(false)}
        onSave={saveAlarm}
        onUpdate={updateAlarm}
        onRemove={removeAlarm}
        onToggle={toggleAlarm}
      />

      <NotificationsModal
        visible={showNotifyMenu}
        onClose={() => setShowNotifyMenu(false)}
        notifyEnabled={notifyEnabled}
        onToggleCurrent={handleToggleNotify}
        currentSongTitle={title}
        exactAlarmGranted={exactAlarmGranted}
      />

      {bibleOpened && (
        <BiblePanel isOpen={showBible} onClose={() => setShowBible(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Allow ScrollView to take available space
  scrollContainer: {
    flex: 1,
  },
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
  loadingHalo: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.signalGlow,
    opacity: 0.22,
  },
  skeletonRow: { gap: 8, alignItems: 'center', marginTop: Spacing.md },
  skeletonLine: { width: 160, height: 10, borderRadius: 6, backgroundColor: Colors.surfaceGlass, opacity: 0.9 },
  skeletonLineShort: { width: 110, opacity: 0.6 },
  loadingText: { ...Typography.body, color: Colors.textMuted, marginTop: Spacing.sm },
  errorText: { ...Typography.body, color: Colors.text, textAlign: 'center', maxWidth: 280, fontWeight: '600' as const },
  errorHint: { ...Typography.caption, color: Colors.textFaint, textAlign: 'center', maxWidth: 260, marginTop: 4 },
  errorIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Colors.tallyMuted,
    borderWidth: 1,
    borderColor: 'rgba(255,59,58,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  topSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  bibleButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radii.full,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.signal,
  },
  bibleButtonText: {
    color: Colors.signal,
    fontWeight: '700' as const,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  logo: {
    width: 168,
    height: 72,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },

  centerSection: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },

  bottomSection: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderGlass,
    backgroundColor: 'rgba(8,10,30,0.72)',
  },
});
