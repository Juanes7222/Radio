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
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAzuraCast } from '@radio/api';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useSleepTimer, SLEEP_PRESETS } from '@/hooks/useSleepTimer';
import {
  useFavoriteNotify,
  loadFavoriteSongKeys,
  saveFavoriteSongKeys,
} from '@/hooks/useFavoriteNotify';
import { STATION_URL, STATION_ID } from '@/constants/api';

export default function PlayerScreen() {
  const { data, isLoading, error } = useAzuraCast({
    stationUrl: STATION_URL,
    stationId: STATION_ID,
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

  const artwork = song?.art || 'https://via.placeholder.com/400x400/1e293b/6366f1?text=Radio';
  const listenersCount = data?.listeners?.current ?? 0;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Conectando con la emisora…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="wifi-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} bounces={false}>
      {/* Fondo con gradiente */}
      <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFill} />

      {/* Banner de reconexión / error */}
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

      {/* Barra superior: notificaciones + sleep timer */}
      <View style={styles.topBar}>
        {/* Botón notificaciones */}
        <TouchableOpacity onPress={notifyEnabled ? disableNotify : () => enableNotify()} style={styles.iconBtn}>
          <Ionicons
            name={notifyEnabled ? 'notifications' : 'notifications-off-outline'}
            size={22}
            color={notifyEnabled ? '#6366f1' : '#475569'}
          />
        </TouchableOpacity>

        {/* Botón sleep timer */}
        <TouchableOpacity
          onPress={() => setShowSleepMenu(true)}
          style={[styles.iconBtn, sleepTimer.isActive && styles.iconBtnActive]}
        >
          <Ionicons
            name="timer-outline"
            size={22}
            color={sleepTimer.isActive ? '#f59e0b' : '#475569'}
          />
          {sleepTimer.isActive && (
            <Text style={styles.timerBadge}>{sleepTimer.display}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Portada */}
      <View style={styles.artWrapper}>
        <Image
          source={{ uri: artwork }}
          style={styles.artwork}
          contentFit="cover"
          transition={400}
        />
      </View>

      {/* Info canción + favorito */}
      <View style={styles.songInfo}>
        <View style={styles.songTitleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {song?.title || 'Sin información'}
          </Text>
          <TouchableOpacity onPress={toggleFavorite} style={styles.heartBtn}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={isFavorite ? '#ef4444' : '#475569'}
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

      {/* Controles */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={toggle}
          style={styles.playButton}
          activeOpacity={0.8}
        >
          {isBuffering ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Countdown del sleep timer */}
      {sleepTimer.isActive && (
        <View style={styles.sleepRow}>
          <Ionicons name="timer-outline" size={14} color="#f59e0b" />
          <Text style={styles.sleepText}>Apagado en {sleepTimer.display}</Text>
          <TouchableOpacity onPress={sleepTimer.cancel} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Oyentes */}
      <View style={styles.listenersRow}>
        <Ionicons name="people-outline" size={14} color="#64748b" />
        <Text style={styles.listenersText}>{listenersCount} oyentes en vivo</Text>
      </View>

      {/* Próxima canción */}
      {data?.playing_next && (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>A continuación</Text>
          <Text style={styles.nextTitle} numberOfLines={1}>
            {data.playing_next.song.artist} — {data.playing_next.song.title}
          </Text>
        </View>
      )}

      {/* Modal sleep timer */}
      <Modal transparent visible={showSleepMenu} animationType="fade" onRequestClose={() => setShowSleepMenu(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowSleepMenu(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Temporizador de apagado</Text>
            {SLEEP_PRESETS.map((min) => (
              <TouchableOpacity
                key={min}
                style={styles.modalOption}
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
                onPress={() => {
                  sleepTimer.cancel();
                  setShowSleepMenu(false);
                }}
              >
                <Text style={[styles.modalOptionText, { color: '#ef4444' }]}>Cancelar temporizador</Text>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { flexGrow: 1, alignItems: 'center', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', gap: 16 },
  loadingText: { color: '#94a3b8', fontSize: 14, marginTop: 8 },
  errorText: { color: '#ef4444', fontSize: 14, textAlign: 'center', maxWidth: 280 },

  // Banner
  banner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  bannerAmber: { backgroundColor: '#92400e' },
  bannerRed: { backgroundColor: '#7f1d1d' },
  bannerText: { color: '#fef3c7', fontSize: 13, flex: 1 },

  // Top bar
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, width: '100%', marginBottom: 16 },
  iconBtn: { padding: 8, borderRadius: 20, backgroundColor: '#1e293b', flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtnActive: { backgroundColor: '#292524' },
  timerBadge: { color: '#f59e0b', fontSize: 12, fontWeight: '700' },

  // Artwork
  artWrapper: {
    width: 260,
    height: 260,
    borderRadius: 130,
    overflow: 'hidden',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 20,
    marginBottom: 32,
  },
  artwork: { width: '100%', height: '100%' },

  // Song info
  songInfo: { alignItems: 'center', gap: 6, marginBottom: 36, width: '100%' },
  songTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%' },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '700', textAlign: 'center', flex: 1 },
  heartBtn: { padding: 4 },
  artist: { color: '#94a3b8', fontSize: 16, fontWeight: '500', textAlign: 'center' },
  album: { color: '#475569', fontSize: 13, textAlign: 'center' },

  // Controls
  controls: { marginBottom: 16 },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },

  // Sleep timer row
  sleepRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sleepText: { color: '#f59e0b', fontSize: 13, fontWeight: '600' },
  cancelBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#292524', borderRadius: 8 },
  cancelBtnText: { color: '#f59e0b', fontSize: 12 },

  // Listeners
  listenersRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  listenersText: { color: '#64748b', fontSize: 12 },

  // Next card
  nextCard: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  nextLabel: { color: '#6366f1', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  nextTitle: { color: '#cbd5e1', fontSize: 14 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 4,
  },
  modalTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  modalOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#0f172a',
  },
  modalOptionCancel: { marginTop: 8 },
  modalOptionText: { color: '#e2e8f0', fontSize: 15, textAlign: 'center' },
});


export default function PlayerScreen() {
  const { data, isLoading, error } = useAzuraCast({
    stationUrl: STATION_URL,
    stationId: STATION_ID,
    pollInterval: 15000,
  });

  const { isPlaying, isBuffering, toggle } = useAudioPlayer({
    streamUrl: data?.station?.listen_url ?? '',
  });

  const song = data?.now_playing?.song;
  const artwork = song?.art || 'https://via.placeholder.com/400x400/1e293b/6366f1?text=Radio';
  const listenersCount = data?.listeners?.current ?? 0;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Conectando con la emisora…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="wifi-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} bounces={false}>
      {/* Fondo con gradiente */}
      <LinearGradient colors={['#0f172a', '#1e1b4b', '#0f172a']} style={StyleSheet.absoluteFill} />

      {/* Portada */}
      <View style={styles.artWrapper}>
        <Image
          source={{ uri: artwork }}
          style={styles.artwork}
          contentFit="cover"
          transition={400}
        />
      </View>

      {/* Info canción */}
      <View style={styles.songInfo}>
        <Text style={styles.title} numberOfLines={2}>
          {song?.title || 'Sin información'}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song?.artist || 'Artista desconocido'}
        </Text>
        {song?.album ? (
          <Text style={styles.album} numberOfLines={1}>{song.album}</Text>
        ) : null}
      </View>

      {/* Controles */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={toggle}
          style={styles.playButton}
          activeOpacity={0.8}
        >
          {isBuffering ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={36} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Oyentes */}
      <View style={styles.listenersRow}>
        <Ionicons name="people-outline" size={14} color="#64748b" />
        <Text style={styles.listenersText}>{listenersCount} oyentes en vivo</Text>
      </View>

      {/* Próxima canción */}
      {data?.playing_next && (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>A continuación</Text>
          <Text style={styles.nextTitle} numberOfLines={1}>
            {data.playing_next.song.artist} — {data.playing_next.song.title}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { flexGrow: 1, alignItems: 'center', paddingTop: 72, paddingBottom: 40, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', gap: 16 },
  loadingText: { color: '#94a3b8', fontSize: 14, marginTop: 8 },
  errorText: { color: '#ef4444', fontSize: 14, textAlign: 'center', maxWidth: 280 },
  artWrapper: {
    width: 280,
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 20,
    marginBottom: 32,
  },
  artwork: { width: '100%', height: '100%' },
  songInfo: { alignItems: 'center', gap: 6, marginBottom: 36, width: '100%' },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  artist: { color: '#94a3b8', fontSize: 16, fontWeight: '500', textAlign: 'center' },
  album: { color: '#475569', fontSize: 13, textAlign: 'center' },
  controls: { marginBottom: 24 },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  listenersRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  listenersText: { color: '#64748b', fontSize: 12 },
  nextCard: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  nextLabel: { color: '#6366f1', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  nextTitle: { color: '#cbd5e1', fontSize: 14 },
});
