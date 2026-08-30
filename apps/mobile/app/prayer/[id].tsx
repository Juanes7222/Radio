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
import { Colors } from '@/constants/theme';
import { getDeviceId } from '@/lib/device';
import { getPrayerStatusConfig, type PrayerItem } from '@/lib/prayer';

const RESPONSE_TEXT = '#e0e7ff';
const ACCENT_BORDER = 'rgba(99,102,241,0.3)';
const ACCENT_TINT = 'rgba(99,102,241,0.06)';

export default function PrayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<PrayerItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const deviceId = await getDeviceId().catch(() => null);
        const url = deviceId
          ? `${BACKEND_URL}/api/prayer/${id}?deviceId=${encodeURIComponent(deviceId)}`
          : `${BACKEND_URL}/api/prayer/${id}`;
        const res = await fetch(url, {
          headers: deviceId ? { 'x-device-id': deviceId } : undefined,
        });
        if (res.ok) {
          const data = await res.json();
          setDetail(data);

          if (!data.readAt && data.respuesta) {
            fetch(`${BACKEND_URL}/api/prayer/${id}/read`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(deviceId ? { 'x-device-id': deviceId } : {}) },
              body: JSON.stringify(deviceId ? { deviceId } : {}),
            }).catch(() => {});
          }
        } else if (res.status === 403) {
          setError('No autorizado para esta petición');
        } else {
          setError('Petición no encontrada');
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
          colors={[Colors.backgroundAlt, Colors.gradientDeep, Colors.backgroundAlt]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <ActivityIndicator size="large" color={Colors.accent} style={{ flex: 1 }} />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[Colors.backgroundAlt, Colors.gradientDeep, Colors.backgroundAlt]}
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

  const config = getPrayerStatusConfig(detail.estado);

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
        <Text style={styles.heading}>Mi petición</Text>
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
          <Ionicons name={config.icon} size={18} color={config.color} />
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
  container: { flex: 1, backgroundColor: Colors.backgroundAlt },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  errorText: { color: Colors.danger, fontSize: 14 },
  backLink: { color: Colors.accent, fontSize: 14, fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { padding: 4 },
  heading: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  content: { paddingHorizontal: 20, gap: 20 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceDim,
    borderRadius: 12,
    padding: 14,
    alignSelf: 'flex-start',
  },
  statusText: { fontSize: 14, fontWeight: '700' },
  section: {
    backgroundColor: Colors.surfaceDim,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceSoft,
    padding: 18,
    gap: 10,
  },
  sectionTitle: {
    color: Colors.textAlt,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionBody: {
    color: Colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
  },
  dateText: {
    color: Colors.textAltFaint,
    fontSize: 11,
  },
  responseSection: {
    borderColor: ACCENT_BORDER,
    backgroundColor: ACCENT_TINT,
  },
  responseTitle: {
    color: Colors.accentLight,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  responseBody: {
    color: RESPONSE_TEXT,
    fontSize: 15,
    lineHeight: 22,
  },
});
