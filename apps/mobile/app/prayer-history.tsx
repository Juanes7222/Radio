import { useState, useCallback } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { BACKEND_URL } from '@/constants/api';
import { getDeviceId } from '@/lib/device';
import { Colors } from '@/constants/theme';
import {
  getPrayerStatusConfig,
  getTimeAgo,
  type PrayerItem,
} from '@/lib/prayer';

const ACCENT_TINT = 'rgba(99,102,241,0.08)';

function PrayerCard({ item, onPress }: { item: PrayerItem; onPress: () => void }) {
  const config = getPrayerStatusConfig(item.estado);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.card}>
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
        <View style={styles.responsePreview}>
          <Ionicons name="chatbubble-ellipses" size={14} color={Colors.accent} />
          <Text style={styles.responsePreviewText} numberOfLines={1}>{item.respuesta}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.heading}>Mis peticiones</Text>
        <TouchableOpacity onPress={() => load()} style={styles.refreshBtn}>
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
          <Text style={styles.emptyText}>No tienes peticiones aún</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PrayerCard
              item={item}
              onPress={() => router.push(`/prayer/${item.id}`)}
            />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 16 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
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
  backBtn: { padding: 4 },
  refreshBtn: { padding: 4 },
  heading: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { color: Colors.textAltFaint, fontSize: 14 },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    backgroundColor: Colors.surfaceDim,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceSoft,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  timeText: { color: Colors.textAltFaint, fontSize: 11 },
  cardName: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  cardRequest: { color: Colors.textAlt, fontSize: 13, lineHeight: 18 },
  responsePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT_TINT,
    borderRadius: 8,
    padding: 8,
  },
  responsePreviewText: { color: Colors.accentLight, fontSize: 12, flex: 1 },
});
