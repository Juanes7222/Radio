import { View, Text, FlatList, StyleSheet, Image } from 'react-native';
import { useAzuraCast } from '@radio/api';
import type { SongHistory } from '@radio/types';
import { STATION_URL, STATION_ID } from '@/constants/api';

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function SongItem({ item, index }: { item: SongHistory; index: number }) {
  return (
    <View style={styles.row}>
      <View style={styles.indexBadge}>
        <Text style={styles.indexText}>{index + 1}</Text>
      </View>
      {item.song.art ? (
        <Image source={{ uri: item.song.art }} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artPlaceholder]} />
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
      </View>
      <Text style={styles.time}>{formatDate(item.played_at)}</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const { history, isLoading } = useAzuraCast({
    stationUrl: STATION_URL,
    stationId: STATION_ID,
    pollInterval: 30000,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Canciones recientes</Text>
      <FlatList
        data={history}
        keyExtractor={(item) => String(item.sh_id)}
        renderItem={({ item, index }) => <SongItem item={item} index={index} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isLoading ? 'Cargando historial…' : 'No hay canciones en el historial'}
          </Text>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: 60 },
  heading: { color: '#f8fafc', fontSize: 22, fontWeight: '700', paddingHorizontal: 20, marginBottom: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  empty: { color: '#475569', textAlign: 'center', marginTop: 48, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  separator: { height: 1, backgroundColor: '#1e293b' },
  indexBadge: { width: 24, alignItems: 'center' },
  indexText: { color: '#475569', fontSize: 12, fontWeight: '600' },
  art: { width: 46, height: 46, borderRadius: 8 },
  artPlaceholder: { backgroundColor: '#1e293b' },
  info: { flex: 1 },
  title: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  artist: { color: '#64748b', fontSize: 12, marginTop: 2 },
  time: { color: '#334155', fontSize: 11 },
});
