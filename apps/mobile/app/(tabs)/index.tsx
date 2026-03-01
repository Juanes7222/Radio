/**
 * Pantalla principal: Player en vivo
 * Usa @radio/api (useAzuraCast) compartido con la web
 */
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAzuraCast } from '@radio/api';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { STATION_URL, STATION_ID } from '@/constants/api';

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
