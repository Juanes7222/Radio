import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAzuraCast } from '@radio/api';
import type { SongRequest } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';
import { formatMediaTitle } from '@/lib/formatMedia';
import { scale, TAB_BAR_HEIGHT } from '../../lib/responsive';

const PAGE_SIZE = 25;
const CACHE_KEY = 'requestable_songs_cache_v2';
const CACHE_TTL_MS = 1000 * 60 * 30;
const DEBOUNCE_MS = 350;

function dedupeSongs(items: SongRequest[]) {
  const seen = new Map<string, SongRequest>();
  for (const item of items) seen.set(item.request_id, item);
  return Array.from(seen.values());
}

type SongRowProps = {
  item: SongRequest;
  isSent: boolean;
  isRequesting: boolean;
  onRequest: (item: SongRequest) => void;
};

const SongRow = memo(function SongRow({
  item,
  isSent,
  isRequesting,
  onRequest,
}: SongRowProps) {
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
          transition={150}
        />
      ) : (
        <View style={[styles.art, styles.artFallback]} />
      )}

      <View style={styles.info}>
        {isPreaching && <Text style={styles.preachingBadge}>Prédica</Text>}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {artist ? (
          <Text style={styles.artist} numberOfLines={1}>{artist}</Text>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={() => onRequest(item)}
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
});

export default function RequestScreen() {
  const insets = useSafeAreaInsets();
  const { requestSong, fetchRequestableSongs } = useAzuraCast({
    apiBaseUrl: BACKEND_URL,
  });

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [songs, setSongs] = useState<SongRequest[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [requesting, setRequesting] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);

  const requestSeq = useRef(0);

  const sentSet = useMemo(() => new Set(sent), [sent]);
  const normalizedQuery = debouncedQuery.trim();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback(
    async ({
      pageToLoad,
      search,
      reset = false,
    }: {
      pageToLoad: number;
      search: string;
      reset?: boolean;
    }) => {
      const seq = ++requestSeq.current;

      try {
        if (reset) {
          setSongs([]);
          setPage(1);
          setHasMore(true);
          setIsInitialLoading(true);
        } else {
          setIsLoadingMore(true);
        }

        const isFirstPageWithoutSearch = pageToLoad === 1 && !search;

        if (isFirstPageWithoutSearch) {
          const cached = await AsyncStorage.getItem(CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached) as {
              songs: SongRequest[];
              timestamp: number;
            };

            if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
              if (seq === requestSeq.current) {
                setSongs(parsed.songs);
                setPage(1);
                setHasMore(parsed.songs.length === PAGE_SIZE);
                setIsInitialLoading(false);
              }
              return;
            }
          }
        }

        const result = await fetchRequestableSongs({
          page: pageToLoad,
          perPage: PAGE_SIZE,
          search,
        });

        const safe = Array.isArray(result) ? result : [];
        if (seq !== requestSeq.current) return;

        setSongs(prev => {
          const merged = reset ? safe : [...prev, ...safe];
          return dedupeSongs(merged);
        });
        setPage(pageToLoad);
        setHasMore(safe.length === PAGE_SIZE);

        if (isFirstPageWithoutSearch) {
          await AsyncStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
              songs: safe,
              timestamp: Date.now(),
            }),
          );
        }
      } catch {
        if (seq === requestSeq.current) {
          setHasMore(false);
        }
      } finally {
        if (seq === requestSeq.current) {
          setIsInitialLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [fetchRequestableSongs],
  );

  useEffect(() => {
    loadPage({
      pageToLoad: 1,
      search: normalizedQuery,
      reset: true,
    });
  }, [normalizedQuery, loadPage]);

  const handleLoadMore = useCallback(() => {
    if (isInitialLoading || isLoadingMore || !hasMore) return;

    loadPage({
      pageToLoad: page + 1,
      search: normalizedQuery,
      reset: false,
    });
  }, [isInitialLoading, isLoadingMore, hasMore, loadPage, page, normalizedQuery]);

  const handleRequest = useCallback(
    async (item: SongRequest) => {
      setRequesting(item.request_id);
      setRequestError(null);

      try {
        const result = await requestSong(item.request_id);

        if (result.success) {
          setSent(prev =>
            prev.includes(item.request_id) ? prev : [...prev, item.request_id],
          );
        } else {
          setRequestError(result.errorMessage);
          setTimeout(() => setRequestError(null), 4000);
        }
      } finally {
        setRequesting(null);
      }
    },
    [requestSong],
  );

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
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
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
        renderItem={({ item }) => (
          <SongRow
            item={item}
            isSent={sentSet.has(item.request_id)}
            isRequesting={requesting === item.request_id}
            onRequest={handleRequest}
          />
        )}
        ListEmptyComponent={
          isInitialLoading ? (
            <ActivityIndicator style={styles.loadingIndicator} color="#818cf8" />
          ) : (
            <Text style={styles.empty}>
              {normalizedQuery ? 'No se encontraron coincidencias' : 'No se encontraron canciones'}
            </Text>
          )
        }
        ListFooterComponent={
          isLoadingMore ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color="#818cf8" />
          ) : null
        }
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16 },
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.6}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        getItemLayout={(_, index) => ({
          length: 74,
          offset: 74 * index,
          index,
        })}
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
  art: { width: scale(50), height: scale(50), borderRadius: 10 },
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