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
import { scale, TAB_BAR_HEIGHT } from '../lib/responsive';

type PrayerStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESPONDIDA' | 'CERRADA';

interface PrayerItem {
  id: string;
  name: string;
  request: string;
  estado: PrayerStatus;
  respuesta: string | null;
  createdAt: string;
  answeredAt: string | null;
}

const STATUS_CONFIG: Record<PrayerStatus, { label: string; icon: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', icon: 'time-outline', color: '#eab308' },
  EN_REVISION: { label: 'En revision', icon: 'sync-outline', color: '#3b82f6' },
  RESPONDIDA: { label: 'Respondida', icon: 'checkmark-circle', color: '#22c55e' },
  CERRADA: { label: 'Cerrada', icon: 'lock-closed-outline', color: '#6b7280' },
};

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `Hace ${days} dia${days > 1 ? 's' : ''}`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
  const minutes = Math.floor(diff / 60000);
  if (minutes > 0) return `Hace ${minutes} min`;
  return 'Ahora';
}

function PrayerCard({ item, onPress }: { item: PrayerItem; onPress: () => void }) {
  const config = STATUS_CONFIG[item.estado] ?? STATUS_CONFIG.PENDIENTE;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.statusRow}>
          <Ionicons name={config.icon as any} size={16} color={config.color} />
          <Text style={[styles.statusText, { color: config.color }]}>{config.label}</Text>
        </View>
        <Text style={styles.timeText}>{getTimeAgo(item.createdAt)}</Text>
      </View>
      <Text style={styles.cardName}>{item.name}</Text>
      <Text style={styles.cardRequest} numberOfLines={2}>{item.request}</Text>
      {item.respuesta && (
        <View style={styles.responsePreview}>
          <Ionicons name="chatbubble-ellipses" size={14} color="#6366f1" />
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

  const load = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0a14', '#130926', '#0a0a14']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#f9fafb" />
        </TouchableOpacity>
        <Text style={styles.heading}>Mis peticiones</Text>
        <TouchableOpacity onPress={load} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#6366f1" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="heart-outline" size={48} color="#4b5563" />
          <Text style={styles.emptyText}>No tienes peticiones aun</Text>
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
            { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a14' },
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
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { color: '#4b5563', fontSize: 14 },
  list: { paddingHorizontal: 16, gap: 12 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
  timeText: { color: '#4b5563', fontSize: 11 },
  cardName: { color: '#f9fafb', fontSize: 13, fontWeight: '700' },
  cardRequest: { color: '#9ca3af', fontSize: 13, lineHeight: 18 },
  responsePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 8,
    padding: 8,
  },
  responsePreviewText: { color: '#818cf8', fontSize: 12, flex: 1 },
});
