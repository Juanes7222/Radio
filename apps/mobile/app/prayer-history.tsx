import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { BACKEND_URL } from '@/constants/api';
import { getDeviceId } from '@/lib/device';
import { Colors, Radii, Typography } from '@/constants/theme';
import { Durations, Easings } from '@/constants/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import {
  getPrayerStatusConfig,
  getTimeAgo,
  hasUnreadAnswer,
  unreadAnswerSummary,
  type PrayerItem,
} from '@/lib/prayer';

interface PrayerCardProps {
  item: PrayerItem;
  /** Takes the id rather than a per-item closure so memo() actually holds. */
  onOpen: (id: string) => void;
}

const PrayerCard = memo(function PrayerCard({ item, onOpen }: PrayerCardProps) {
  const config = getPrayerStatusConfig(item.estado);
  const unread = hasUnreadAnswer(item);
  const reducedMotion = useReducedMotion();

  // A slow breathe, not a flash: the card is already the loudest thing on screen
  // thanks to the edge bar and the label, so the dot only has to keep the eye
  // from settling on it as settled.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!unread || reducedMotion) {
      pulse.value = withTiming(1, { duration: Durations.fast });
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: Durations.ambient / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: Durations.ambient / 2, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [unread, reducedMotion, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <TouchableOpacity
      onPress={() => onOpen(item.id)}
      activeOpacity={0.7}
      style={[styles.card, unread && styles.cardUnread]}
      accessibilityRole="button"
      accessibilityLabel={`Petición de ${item.name}, ${config.label}${unread ? ', respuesta nueva sin leer' : ''}`}
    >
      {unread && <View style={styles.unreadEdge} />}
      <View style={styles.cardHeader}>
        <View style={styles.statusRow}>
          <Ionicons name={config.icon} size={16} color={config.color} />
          <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
        </View>
        <Text style={styles.timeText}>{getTimeAgo(item.createdAt)}</Text>
      </View>
      <Text style={styles.cardName}>{item.name}</Text>
      <Text style={styles.cardRequest} numberOfLines={2}>{item.request}</Text>
      {item.respuesta && (
        <View style={[styles.responsePreview, unread && styles.responsePreviewUnread]}>
          {unread && (
            <View
              style={styles.unreadLabelRow}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <Animated.View style={[styles.unreadDot, pulseStyle]}>
                <View style={styles.unreadDotCore} />
              </Animated.View>
              <Text style={styles.unreadLabel}>Respuesta nueva</Text>
            </View>
          )}
          <View style={styles.responseRow}>
            <Ionicons
              name="chatbubble-ellipses"
              size={14}
              color={unread ? Colors.accentLight : Colors.accent}
            />
            <Text
              style={styles.responsePreviewText}
              numberOfLines={unread ? 2 : 1}
            >
              {item.respuesta}
            </Text>
          </View>
        </View>
      )}
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
    ({ item }: { item: PrayerItem }) => <PrayerCard item={item} onOpen={handleOpen} />,
    [handleOpen]
  );

  const handleKeyExtractor = useCallback((item: PrayerItem) => item.id, []);

  // Derived from the rows on screen rather than from the server count, so the
  // summary and the cards can never disagree with each other.
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
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
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
          <Ionicons name="refresh" size={20} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
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
              { paddingBottom: insets.bottom + 16 },
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  heading: {
    ...Typography.screenTitle,
    color: Colors.text,
  },
  headingBlock: { alignItems: 'center', gap: 2 },
  headingSummary: { ...Typography.caption, color: Colors.accentLight },
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
    backgroundColor: Colors.signal,
    borderRadius: Radii.full,
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 44,
    marginTop: 8,
  },
  emptyActionText: { ...Typography.captionStrong, color: Colors.textOnSignal, fontSize: 13 },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    backgroundColor: Colors.surfaceDim,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceSoft,
    padding: 16,
    gap: 8,
    overflow: 'hidden',
  },
  cardUnread: {
    backgroundColor: Colors.signalFaint,
    borderColor: Colors.signalMuted,
  },
  unreadEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: Colors.signal,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { ...Typography.captionStrong },
  timeText: { ...Typography.caption, color: Colors.textMuted, fontSize: 11, lineHeight: 15 },
  cardName: { ...Typography.bodyStrong, color: Colors.text, fontSize: 13 },
  cardRequest: { ...Typography.body, color: Colors.textAlt, fontSize: 13, lineHeight: 18 },
  responsePreview: {
    gap: 6,
    backgroundColor: Colors.signalFaint,
    borderRadius: 8,
    padding: 8,
  },
  responsePreviewUnread: {
    backgroundColor: Colors.signalSoft,
    borderWidth: 1,
    borderColor: Colors.signalMuted,
  },
  unreadLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unreadLabel: {
    ...Typography.eyebrow,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1,
    color: Colors.accentLight,
  },
  unreadDot: {
    width: 7,
    height: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadDotCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.signalLight,
  },
  responseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  responsePreviewText: { ...Typography.caption, color: Colors.accentLight, flex: 1 },
});
