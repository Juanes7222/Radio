import { memo, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { BACKEND_URL } from '@/constants/api';
import { getDeviceId } from '@/lib/device';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { ShimmerBox } from '@/components/ui/Shimmer';
import { Durations, Easings } from '@/constants/motion';
import { PrayerNode, type PrayerNodeTone } from '@/components/prayer/PrayerNode';
import {
  getPrayerStatusConfig,
  getTimeAgo,
  hasUnreadAnswer,
  unreadAnswerSummary,
  type PrayerItem,
} from '@/lib/prayer';

interface PrayerRowProps {
  item: PrayerItem;
  /** Takes the id rather than a per-item closure so memo() actually holds. */
  onOpen: (id: string) => void;
  isLast: boolean;
}

/**
 * One petition, as a line of the thread: the node carries the state and the
 * text carries the words. The petition is the protagonist, so the message
 * comes first and the metadata is the quiet line under it.
 */
const PrayerRow = memo(function PrayerRow({ item, onOpen, isLast }: PrayerRowProps) {
  const config = getPrayerStatusConfig(item.estado);
  const unread = hasUnreadAnswer(item);

  const tone: PrayerNodeTone = unread
    ? 'unread'
    : item.respuesta
      ? 'answered'
      : item.estado === 'CERRADA'
        ? 'muted'
        : 'waiting';

  return (
    <TouchableOpacity
      onPress={() => onOpen(item.id)}
      activeOpacity={0.7}
      style={[styles.row, !isLast && styles.rowDivider]}
      accessibilityRole="button"
      accessibilityLabel={`Petición de ${item.name}, ${config.label}${unread ? ', respuesta nueva sin leer' : ''}`}
    >
      <View style={styles.rowNode}>
        <PrayerNode tone={tone} />
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowMessage} numberOfLines={2}>
          {item.request}
        </Text>

        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.name} · {config.label} · {getTimeAgo(item.createdAt)}
        </Text>

        {unread && <Text style={styles.rowUnreadLabel}>Respuesta nueva</Text>}

        {item.respuesta && (
          <View style={styles.rowReply}>
            <Ionicons
              name="return-down-forward-outline"
              size={13}
              color={unread ? Colors.signal : Colors.textAltFaint}
            />
            <Text
              style={[styles.rowReplyText, unread && styles.rowReplyTextUnread]}
              numberOfLines={1}
            >
              {item.respuesta}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

export default function PrayerHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [requests, setRequests] = useState<PrayerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const res = await fetch(`${BACKEND_URL}/api/prayer/my/${deviceId}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.rows ?? []);
      } else {
        setError('Error al cargar');
      }
    } catch {
      setError('Error de conexion');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const handleOpen = useCallback(
    (id: string) => {
      router.push(`/prayer/${id}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: PrayerItem; index: number }) => (
      <PrayerRow item={item} onOpen={handleOpen} isLast={index === requests.length - 1} />
    ),
    [handleOpen, requests.length]
  );

  const handleKeyExtractor = useCallback((item: PrayerItem) => item.id, []);

  // Derived from the rows on screen rather than from the server count, so the
  // summary and the rows can never disagree with each other.
  const unreadAnswers = useMemo(
    () => requests.filter(hasUnreadAnswer).length,
    [requests]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[Colors.backgroundAlt, Colors.gradientDeep, Colors.backgroundAlt]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headingBlock}>
          <Text style={styles.heading}>Mis peticiones</Text>
          {unreadAnswers > 0 && (
            <Text
              style={styles.headingSummary}
              accessibilityLiveRegion="polite"
            >
              {unreadAnswerSummary(unreadAnswers)}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => load()}
          style={styles.refreshBtn}
          accessibilityRole="button"
          accessibilityLabel="Actualizar mis peticiones"
        >
          <Ionicons name="refresh" size={20} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.skeletonList}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={styles.skeletonRow}>
              <ShimmerBox style={styles.skeletonNode} borderRadius={6} />
              <View style={styles.skeletonBody}>
                <ShimmerBox style={styles.skeletonLine} borderRadius={6} />
                <ShimmerBox style={styles.skeletonLineShort} borderRadius={4} />
              </View>
            </View>
          ))}
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="heart-outline" size={48} color={Colors.textAltFaint} />
          <Text style={styles.emptyText}>Aún no has enviado peticiones</Text>
          <Text style={styles.emptyHint}>
            Cuando envíes una, aquí verás su estado y la respuesta del equipo.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.emptyAction}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Escribir mi primera petición"
          >
            <Ionicons name="heart" size={15} color={Colors.textOnSignal} />
            <Text style={styles.emptyActionText}>Escribir mi primera petición</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Animated.View
          entering={FadeIn.duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
          style={{ flex: 1 }}
        >
          <FlatList
            data={requests}
            keyExtractor={handleKeyExtractor}
            renderItem={renderItem}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + Spacing.lg },
            ]}
            showsVerticalScrollIndicator={false}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundAlt },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  backBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -12,
  },
  refreshBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -12,
  },
  headingBlock: { flex: 1, gap: 2 },
  heading: {
    ...Typography.screenTitle,
    color: Colors.text,
  },
  headingSummary: { ...Typography.caption, color: Colors.signalLight },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { ...Typography.body, color: Colors.textMuted, textAlign: 'center' },
  emptyHint: {
    ...Typography.caption,
    color: Colors.textMuted,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.signalFill,
    borderRadius: Radii.full,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 48,
    marginTop: 8,
  },
  emptyActionText: { ...Typography.captionStrong, color: Colors.textOnSignal },
  list: { paddingHorizontal: Spacing.md },
  skeletonList: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.md },
  skeletonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    minHeight: 72,
    alignItems: 'flex-start',
  },
  skeletonNode: { width: 12, height: 12 },
  skeletonBody: { flex: 1, gap: 6 },
  skeletonLine: { height: 14, width: '68%' },
  skeletonLineShort: { height: 10, width: '38%' },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 72,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderGlass,
  },
  rowNode: { width: 18, alignItems: 'center', paddingTop: 4 },
  rowBody: { flex: 1, gap: 4 },
  rowMessage: { ...Typography.body, color: Colors.text },
  rowMeta: { ...Typography.caption, color: Colors.textMuted },
  rowUnreadLabel: { ...Typography.label, color: Colors.signal, marginTop: 2 },
  rowReply: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  rowReplyText: { ...Typography.caption, color: Colors.textMuted, flex: 1 },
  rowReplyTextUnread: { color: Colors.textSoft },
});
