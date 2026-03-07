/**
 * Pantalla principal: Player en vivo
 * Usa @radio/api (useAzuraCast) compartido con la web.
 * Funcionalidades: reconexión automática, sleep timer, favoritos, notificaciones.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
  Dimensions,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VinylDisc } from '@/components/VinylDisc';
import { useAzuraCast } from '@radio/api';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useSleepTimer, SLEEP_PRESETS } from '@/hooks/useSleepTimer';
import {
  useFavoriteNotify,
  loadFavoriteSongKeys,
  saveFavoriteSongKeys,
} from '@/hooks/useFavoriteNotify';
import { BACKEND_URL } from '@/constants/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 56;
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();

  const { data, isLoading, error } = useAzuraCast({
    apiBaseUrl: BACKEND_URL,
    pollInterval: 15000,
  });

  const { isPlaying, isBuffering, error: audioError, reconnectAttempt, toggle, pause } =
    useAudioPlayer({ streamUrl: data?.station?.listen_url ?? '' });

  // ── Sleep timer ──────────────────────────────────────────────
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const sleepTimer = useSleepTimer(useCallback(async () => {
    await pause();
  }, [pause]));

  // ── Favoritos ────────────────────────────────────────────────
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

  const toggleFavorite = useCallback(async () => {
    if (!currentSongKey) return;
    const next = isFavorite
      ? favoriteSongKeys.filter((k) => k.toLowerCase() !== currentSongKey)
      : [...favoriteSongKeys, currentSongKey];
    setFavoriteSongKeys(next);
    await saveFavoriteSongKeys(next);
  }, [currentSongKey, isFavorite, favoriteSongKeys]);

  // ── Notificaciones de favoritos ───────────────────────────────
  const currentSongForNotify = song
    ? { id: song.id, title: song.title, artist: song.artist, art: song.art }
    : null;
  const { isEnabled: notifyEnabled, enable: enableNotify, disable: disableNotify } =
    useFavoriteNotify(currentSongForNotify, favoriteSongKeys);

  const artworkUri = song?.art ?? null;
  const listenersCount = data?.listeners?.current ?? 0;

  const openFacebook = useCallback(() => {
    Linking.openURL('https://www.facebook.com/lavozdlaverdad');
  }, []);

  // ── Loading / Error states ────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#0a0a14', '#120828', '#0a0a14']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#818cf8" />
        <Text style={styles.loadingText}>Conectando con la emisora…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#0a0a14', '#120828', '#0a0a14']} style={StyleSheet.absoluteFill} />
        <Ionicons name="wifi-outline" size={52} color="#ef4444" />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Fondo degradado inmersivo */}
      <LinearGradient
        colors={['#0a0a14', '#130926', '#0a0a14']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24 },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner de reconexión o error de audio */}
        {(reconnectAttempt > 0 || audioError) && (
          <View style={[styles.banner, reconnectAttempt > 0 ? styles.bannerAmber : styles.bannerRed]}>
            {reconnectAttempt > 0 && (
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.bannerText} numberOfLines={2}>
              {audioError ?? 'Error de reproducción'}
            </Text>
          </View>
        )}

        {/* Barra superior */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={notifyEnabled ? disableNotify : () => enableNotify()}
            style={styles.iconBtn}
            activeOpacity={0.7}
          >
            <Ionicons
              name={notifyEnabled ? 'notifications' : 'notifications-off-outline'}
              size={20}
              color={notifyEnabled ? '#818cf8' : '#4b5563'}
            />
          </TouchableOpacity>

          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>EN VIVO</Text>
          </View>

          <TouchableOpacity
            onPress={() => setShowSleepMenu(true)}
            style={[styles.iconBtn, sleepTimer.isActive && styles.iconBtnActive]}
            activeOpacity={0.7}
          >
            <Ionicons
              name="timer-outline"
              size={20}
              color={sleepTimer.isActive ? '#f59e0b' : '#4b5563'}
            />
            {sleepTimer.isActive && (
              <Text style={styles.timerBadge}>{sleepTimer.display}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Vinilo giratorio */}
        <View style={styles.artWrapper}>
          <VinylDisc
            artworkUri={artworkUri}
            isPlaying={isPlaying || isBuffering}
            size={ARTWORK_SIZE}
          />
        </View>

        {/* Info de la canción + corazón */}
        <View style={styles.songInfo}>
          <View style={styles.songTitleRow}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {song?.title || 'Sin información'}
            </Text>
            <TouchableOpacity onPress={toggleFavorite} style={styles.heartBtn} activeOpacity={0.7}>
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={26}
                color={isFavorite ? '#ef4444' : '#374151'}
              />
            </TouchableOpacity>
          </View>
          <Text style={styles.artist} numberOfLines={1}>
            {song?.artist || 'Artista desconocido'}
          </Text>
          {song?.album ? (
            <Text style={styles.album} numberOfLines={1}>{song.album}</Text>
          ) : null}
        </View>

        {/* Controles de reproducción */}
        <View style={styles.controls}>
          <Pressable
            onPress={toggle}
            style={({ pressed }) => [
              styles.playButton,
              pressed && styles.playButtonPressed,
            ]}
          >
            {isBuffering ? (
              <ActivityIndicator size="large" color="#130926" />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={38}
                color="#130926"
                style={!isPlaying ? { marginLeft: 4 } : undefined}
              />
            )}
          </Pressable>
        </View>

        {/* Oyentes en vivo */}
        <View style={styles.listenersRow}>
          <View style={styles.listeningDot} />
          <Text style={styles.listenersText}>
            {listenersCount} {listenersCount === 1 ? 'oyente' : 'oyentes'} en vivo
          </Text>
        </View>

        {/* Countdown del sleep timer */}
        {sleepTimer.isActive && (
          <View style={styles.sleepRow}>
            <Ionicons name="timer-outline" size={14} color="#f59e0b" />
            <Text style={styles.sleepText}>Apagado en {sleepTimer.display}</Text>
            <TouchableOpacity onPress={sleepTimer.cancel} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Próxima canción */}
        {data?.playing_next && (
          <View style={styles.nextCard}>
            <Ionicons name="musical-note-outline" size={14} color="#818cf8" />
            <Text style={styles.nextLabel}>A continuación:</Text>
            <Text style={styles.nextTitle} numberOfLines={1}>
              {data.playing_next.song.artist} — {data.playing_next.song.title}
            </Text>
          </View>
        )}

        {/* Tarjeta de cultos presenciales */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={18} color="#818cf8" />
            <Text style={styles.cardTitle}>Cultos presenciales</Text>
          </View>
          {[
            'Martes y Jueves — 7:00 PM',
            'Sábados — 6:30 PM',
            'Domingos — 9:00 AM',
          ].map((schedule) => (
            <View key={schedule} style={styles.scheduleRow}>
              <Ionicons name="time-outline" size={14} color="#6b7280" />
              <Text style={styles.scheduleText}>{schedule}</Text>
            </View>
          ))}
          <View style={[styles.scheduleRow, styles.scheduleRowLast]}>
            <Ionicons name="location-outline" size={14} color="#6b7280" />
            <Text style={styles.scheduleText}>Cra 7 #13-35, Barrio La Libertad</Text>
          </View>
        </View>

        {/* Botón Facebook */}
        <TouchableOpacity onPress={openFacebook} style={styles.facebookBtn} activeOpacity={0.8}>
          <Ionicons name="logo-facebook" size={20} color="#fff" />
          <Text style={styles.facebookBtnText}>Síguenos en Facebook</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal sleep timer */}
      <Modal
        transparent
        visible={showSleepMenu}
        animationType="fade"
        onRequestClose={() => setShowSleepMenu(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSleepMenu(false)}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.modalTitle}>Temporizador de apagado</Text>
            {SLEEP_PRESETS.map((min) => (
              <TouchableOpacity
                key={min}
                style={styles.modalOption}
                activeOpacity={0.7}
                onPress={() => {
                  sleepTimer.start(min);
                  setShowSleepMenu(false);
                }}
              >
                <Text style={styles.modalOptionText}>{min} minutos</Text>
              </TouchableOpacity>
            ))}
            {sleepTimer.isActive && (
              <TouchableOpacity
                style={[styles.modalOption, styles.modalOptionCancel]}
                activeOpacity={0.7}
                onPress={() => {
                  sleepTimer.cancel();
                  setShowSleepMenu(false);
                }}
              >
                <Text style={[styles.modalOptionText, { color: '#ef4444' }]}>
                  Cancelar temporizador
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a14' },
  scroll: { flex: 1 },
  content: { alignItems: 'center', paddingHorizontal: 24 },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a14',
    gap: 16,
  },
  loadingText: { color: '#6b7280', fontSize: 15, marginTop: 12 },
  errorText: { color: '#ef4444', fontSize: 14, textAlign: 'center', maxWidth: 280 },

  // ── Banner ──────────────────────────────────────────────────
  banner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  bannerAmber: { backgroundColor: 'rgba(146, 64, 14, 0.85)' },
  bannerRed: { backgroundColor: 'rgba(127, 29, 29, 0.85)' },
  bannerText: { color: '#fef3c7', fontSize: 13, flex: 1 },

  // ── Top bar ─────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 28,
  },
  iconBtn: {
    padding: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtnActive: { backgroundColor: 'rgba(245,158,11,0.12)' },
  timerBadge: { color: '#f59e0b', fontSize: 12, fontWeight: '700' },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ef4444',
  },
  liveText: {
    color: '#e5e7eb',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  // ── Artwork ─────────────────────────────────────────────────
  artWrapper: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    marginBottom: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Song info ────────────────────────────────────────────────
  songInfo: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 36,
    width: '100%',
  },
  songTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    paddingHorizontal: 4,
  },
  title: {
    color: '#f9fafb',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    flex: 1,
  },
  heartBtn: { padding: 4 },
  artist: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  album: {
    color: 'rgba(255,255,255,0.32)',
    fontSize: 14,
    textAlign: 'center',
  },

  // ── Controls ─────────────────────────────────────────────────
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#818cf8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.7,
    shadowRadius: 22,
    elevation: 14,
  },
  playButtonPressed: {
    transform: [{ scale: 0.93 }],
    backgroundColor: '#e5e7eb',
  },

  // ── Listeners ────────────────────────────────────────────────
  listenersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 24,
  },
  listeningDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22c55e',
  },
  listenersText: { color: '#4b5563', fontSize: 13 },

  // ── Sleep row ────────────────────────────────────────────────
  sleepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 16,
    backgroundColor: 'rgba(245,158,11,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    width: '100%',
  },
  sleepText: { color: '#f59e0b', fontSize: 13, flex: 1 },
  cancelBtn: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 7,
  },
  cancelBtnText: { color: '#f59e0b', fontSize: 12, fontWeight: '600' },

  // ── Next song card ───────────────────────────────────────────
  nextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: 'rgba(129,140,248,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(129,140,248,0.15)',
  },
  nextLabel: { color: '#818cf8', fontSize: 12, fontWeight: '700' },
  nextTitle: { color: '#6b7280', fontSize: 13, flex: 1 },

  // ── Info card (glassmorphism) ─────────────────────────────────
  card: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  cardTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  scheduleRowLast: { marginBottom: 0, marginTop: 4 },
  scheduleText: { color: '#9ca3af', fontSize: 14 },

  // ── Facebook button ──────────────────────────────────────────
  facebookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: '#1877f2',
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 4,
  },
  facebookBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Modal ────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#111827',
    borderRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  modalTitle: {
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalOption: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  modalOptionText: { color: '#e5e7eb', fontSize: 16, textAlign: 'center' },
  modalOptionCancel: { borderBottomWidth: 0, marginTop: 4 },
});




