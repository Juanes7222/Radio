import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAzuraCast } from '@radio/api';
import type { SongHistory } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;

export default function RequestScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const { data, requestSong } = useAzuraCast({
    apiBaseUrl: BACKEND_URL,
  });
  const [requesting, setRequesting] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [requestError, setRequestError] = useState<string | null>(null);

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
    setRequestError(null);
    const result = await requestSong(item.song.id);
    if (result.success) {
      setSent((prev) => new Set([...prev, item.song.id]));
    } else {
      setRequestError(result.errorMessage);
      setTimeout(() => setRequestError(null), 4000);
    }
    setRequesting(null);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0a14', '#130926', '#0a0a14']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Text style={[styles.heading, { paddingTop: insets.top + 20 }]}>
        Solicitar canción
      </Text>

      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={16} color="#4b5563" style={styles.searchIcon} />
        <TextInput
          style={styles.search}
          placeholder="Buscar en el historial…"
          placeholderTextColor="#374151"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}>
            <Ionicons name="close-circle" size={16} color="#4b5563" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.song.id}
        renderItem={({ item }) => {
          const isSent = sent.has(item.song.id);
          const isLoading = requesting === item.song.id;
          return (
            <View style={styles.row}>
              {item.song.art ? (
                <Image
                  source={{ uri: item.song.art }}
                  style={styles.art}
                  contentFit="cover"
                  transition={300}
                />
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
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : isSent ? (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Pedir</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16 },
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No se encontraron canciones</Text>
        }
        showsVerticalScrollIndicator={false}
      />

      {requestError && (
        <View style={[styles.errorBanner, { bottom: insets.bottom + TAB_BAR_HEIGHT + 12 }]}>
          <Ionicons name="alert-circle" size={16} color="#fca5a5" />
          <Text style={styles.errorBannerText}>{requestError}</Text>
        </View>
      )}
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
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  search: {
    flex: 1,
    color: '#f1f5f9',
    fontSize: 14,
    padding: 0,
  },
  list: { paddingHorizontal: 16 },
  empty: { color: '#4b5563', textAlign: 'center', marginTop: 48, fontSize: 14 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 66 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  art: { width: 50, height: 50, borderRadius: 10 },
  artFallback: { backgroundColor: 'rgba(255,255,255,0.06)' },
  info: { flex: 1 },
  title: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },
  artist: { color: '#4b5563', fontSize: 12, marginTop: 3 },
  btn: {
    backgroundColor: '#818cf8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 60,
    alignItems: 'center',
  },
  btnSent: { backgroundColor: '#16a34a' },
  btnText: { color: '#0a0a14', fontSize: 13, fontWeight: '700' },
  errorBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(127, 29, 29, 0.92)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(252, 165, 165, 0.2)',
  },
  errorBannerText: {
    color: '#fca5a5',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
});
