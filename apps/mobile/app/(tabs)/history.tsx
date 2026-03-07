import { View, Text, FlatList, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAzuraCast } from '@radio/api';
import type { SongHistory } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;

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
        <Image source={{ uri: item.song.art }} style={styles.art} contentFit="cover" transition={300} />
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
  const insets = useSafeAreaInsets();
  const { history, isLoading } = useAzuraCast({
    apiBaseUrl: BACKEND_URL,
    pollInterval: 30000,
  });

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0a14', '#130926', '#0a0a14']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Text style={[styles.heading, { paddingTop: insets.top + 20 }]}>
        Canciones recientes
      </Text>
      <FlatList
        data={history}
        keyExtractor={(item) => String(item.sh_id)}
        renderItem={({ item, index }) => <SongItem item={item} index={index} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16 },
        ]}
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
  container: { flex: 1, backgroundColor: '#0a0a14' },
  heading: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  list: { paddingHorizontal: 16 },
  empty: { color: '#4b5563', textAlign: 'center', marginTop: 48, fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 80 },
  indexBadge: { width: 26, alignItems: 'center' },
  indexText: { color: '#374151', fontSize: 12, fontWeight: '600' },
  art: { width: 50, height: 50, borderRadius: 10 },
  artPlaceholder: { backgroundColor: 'rgba(255,255,255,0.06)' },
  info: { flex: 1 },
  title: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  artist: { color: '#4b5563', fontSize: 12, marginTop: 3 },
  time: { color: '#374151', fontSize: 11, fontWeight: '500' },
});
