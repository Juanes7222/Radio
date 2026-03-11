import { useState, useEffect, useCallback } from 'react';
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
import type { SongRequest } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';
import { formatMediaTitle } from '@/lib/formatMedia';

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;
const PAGE_SIZE = 25;

export default function RequestScreen() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [songs, setSongs] = useState<SongRequest[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingSongs, setIsFetchingSongs] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);

  const { requestSong, fetchRequestableSongs } = useAzuraCast({ apiBaseUrl: BACKEND_URL });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback(async (pageNumber: number, search: string, replace: boolean) => {
    if (pageNumber === 1) setIsFetchingSongs(true);
    else setIsLoadingMore(true);

    try {
      const results = await fetchRequestableSongs({ page: pageNumber, perPage: PAGE_SIZE, search });
      const safeResults = Array.isArray(results) ? results : [];
      setSongs(prev => {
        const merged = replace ? safeResults : [...prev, ...safeResults];
        const seen = new Map<string, SongRequest>();
        for (const item of merged) seen.set(item.request_id, item);
        return Array.from(seen.values());
      });
      setHasMore(safeResults.length === PAGE_SIZE);
      setPage(pageNumber);
    } catch {
      // keep existing list
    } finally {
      setIsFetchingSongs(false);
      setIsLoadingMore(false);
    }
  }, [fetchRequestableSongs]);

  useEffect(() => {
    loadPage(1, debouncedQuery, true);
  }, [debouncedQuery, loadPage]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    loadPage(page + 1, debouncedQuery, false);
  }, [isLoadingMore, hasMore, page, debouncedQuery, loadPage]);

  const handleRequest = async (item: SongRequest) => {
    setRequesting(item.request_id);
    setRequestError(null);
    const result = await requestSong(item.request_id);
    if (result.success) {
      setSent(prev => [...prev, item.request_id]);
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
          placeholder="Buscar canción o artista…"
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
        data={songs}
        keyExtractor={(item) => item.request_id}
        renderItem={({ item }) => {
          const isSent = sent.includes(item.request_id);
          const isRequesting = requesting === item.request_id;
          const { title, artist, isPreaching } = formatMediaTitle(
            item.song.title,
            item.song.artist,
          );

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
                {isPreaching && (
                  <Text style={styles.preachingBadge}>Prédica</Text>
                )}
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                {artist ? (
                  <Text style={styles.artist} numberOfLines={1}>{artist}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => handleRequest(item)}
                disabled={isSent || isRequesting}
                style={[styles.btn, isSent && styles.btnSent]}
                activeOpacity={0.8}
              >
                {isRequesting ? (
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
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isLoadingMore
            ? <ActivityIndicator style={{ marginVertical: 16 }} color="#818cf8" />
            : null
        }
        ListEmptyComponent={
          isFetchingSongs
            ? <ActivityIndicator style={styles.loadingIndicator} color="#818cf8" />
            : <Text style={styles.empty}>No se encontraron canciones</Text>
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16 },
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  loadingIndicator: { marginTop: 48 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginLeft: 66 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  art: { width: 50, height: 50, borderRadius: 10 },
  artFallback: { backgroundColor: 'rgba(255,255,255,0.06)' },
  info: { flex: 1 },
  preachingBadge: {
    color: '#818cf8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
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