import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BACKEND_URL } from '@/constants/api';

type PrayerStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESPONDIDA' | 'CERRADA';

const STATUS_CONFIG: Record<PrayerStatus, { label: string; icon: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', icon: 'time-outline', color: '#eab308' },
  EN_REVISION: { label: 'En revision', icon: 'sync-outline', color: '#3b82f6' },
  RESPONDIDA: { label: 'Respondida', icon: 'checkmark-circle', color: '#22c55e' },
  CERRADA: { label: 'Cerrada', icon: 'lock-closed-outline', color: '#6b7280' },
};

interface PrayerDetail {
  id: string;
  name: string;
  request: string;
  estado: PrayerStatus;
  respuesta: string | null;
  createdAt: string;
  answeredAt: string | null;
  readAt: string | null;
}

export default function PrayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<PrayerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/prayer/${id}`);
        if (res.ok) {
          const data = await res.json();
          setDetail(data);

          if (!data.readAt && data.respuesta) {
            fetch(`${BACKEND_URL}/api/prayer/${id}/read`, {
              method: 'POST',
            }).catch(() => {});
          }
        } else {
          setError('Peticion no encontrada');
        }
      } catch {
        setError('Error de conexion');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#0a0a14', '#130926', '#0a0a14']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color="#6366f1" style={{ flex: 1 }} />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#0a0a14', '#130926', '#0a0a14']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Error desconocido'}</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const config = STATUS_CONFIG[detail.estado] ?? STATUS_CONFIG.PENDIENTE;

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
        <Text style={styles.heading}>Mi peticion</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statusBadge}>
          <Ionicons name={config.icon as any} size={18} color={config.color} />
          <Text style={[styles.statusText, { color: config.color }]}>
            {config.label}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mi mensaje</Text>
          <Text style={styles.sectionBody}>{detail.request}</Text>
          <Text style={styles.dateText}>
            {new Date(detail.createdAt).toLocaleDateString('es', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {detail.respuesta && (
          <View style={[styles.section, styles.responseSection]}>
            <Text style={styles.responseTitle}>Respuesta</Text>
            <Text style={styles.responseBody}>{detail.respuesta}</Text>
            {detail.answeredAt && (
              <Text style={styles.dateText}>
                {new Date(detail.answeredAt).toLocaleDateString('es', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a14' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  errorText: { color: '#ef4444', fontSize: 14 },
  backLink: { color: '#6366f1', fontSize: 14, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  heading: {
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  content: { paddingHorizontal: 20, gap: 20 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    alignSelf: 'flex-start',
  },
  statusText: { fontSize: 14, fontWeight: '700' },
  section: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 18,
    gap: 10,
  },
  sectionTitle: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionBody: {
    color: '#f1f5f9',
    fontSize: 15,
    lineHeight: 22,
  },
  dateText: {
    color: '#4b5563',
    fontSize: 11,
  },
  responseSection: {
    borderColor: 'rgba(99,102,241,0.3)',
    backgroundColor: 'rgba(99,102,241,0.06)',
  },
  responseTitle: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  responseBody: {
    color: '#e0e7ff',
    fontSize: 15,
    lineHeight: 22,
  },
});
