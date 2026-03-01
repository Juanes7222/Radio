import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useAzuraCast } from '@radio/api';
import type { SongHistory } from '@radio/types';
import { STATION_URL, STATION_ID } from '@/constants/api';

export default function RequestScreen() {
  const [query, setQuery] = useState('');
  const { data, requestSong } = useAzuraCast({
    stationUrl: STATION_URL,
    stationId: STATION_ID,
  });
  const [requesting, setRequesting] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  const history = data?.song_history ?? [];
  const filtered = query.trim()
    ? history.filter(
        (s) =>
          s.song.title.toLowerCase().includes(query.toLowerCase()) ||
          s.song.artist.toLowerCase().includes(query.toLowerCase())
      )
    : history;

  const handleRequest = async (item: SongHistory) => {
    setRequesting(item.song.id);
    const ok = await requestSong(item.song.id);
    if (ok) setSent((prev) => new Set([...prev, item.song.id]));
    setRequesting(null);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Solicitar canción</Text>

      <TextInput
        style={styles.search}
        placeholder="Buscar en el historial…"
        placeholderTextColor="#475569"
        value={query}
        onChangeText={setQuery}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.song.id}
        renderItem={({ item }) => {
          const isSent = sent.has(item.song.id);
          const isLoading = requesting === item.song.id;
          return (
            <View style={styles.row}>
              {item.song.art ? (
                <Image source={{ uri: item.song.art }} style={styles.art} contentFit="cover" />
              ) : (
                <View style={[styles.art, styles.artFallback]} />
              )}
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleRequest(item)}
                disabled={isSent || isLoading}
                style={[styles.btn, isSent && styles.btnSent]}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnText}>{isSent ? '✓' : 'Pedir'}</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No se encontraron canciones</Text>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: 60 },
  heading: { color: '#f8fafc', fontSize: 22, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 },
  search: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f1f5f9',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { color: '#475569', textAlign: 'center', marginTop: 48, fontSize: 14 },
  separator: { height: 1, backgroundColor: '#1e293b' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  art: { width: 46, height: 46, borderRadius: 8 },
  artFallback: { backgroundColor: '#1e293b' },
  info: { flex: 1 },
  title: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  artist: { color: '#64748b', fontSize: 12, marginTop: 2 },
  btn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 54,
    alignItems: 'center',
  },
  btnSent: { backgroundColor: '#16a34a' },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
