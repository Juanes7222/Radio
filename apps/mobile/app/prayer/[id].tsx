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
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BACKEND_URL } from '@/constants/api';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { Durations, Easings } from '@/constants/motion';
import { getDeviceId } from '@/lib/device';
import { usePrayerAnswers } from '@/hooks/usePrayerAnswers';
import { PrayerNode } from '@/components/prayer/PrayerNode';
import { formatPrayerMoment, getPrayerStatusConfig, type PrayerItem } from '@/lib/prayer';

export default function PrayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { acknowledgeAnswer } = usePrayerAnswers();
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

          // Opening the answer IS the read receipt, so it goes to its own
          // endpoint: POST /:id/read stamps the station team's unread marker, and
          // writing that column from a phone would clear the admin inbox badge
          // without anyone in the panel having opened the petition.
          if (deviceId && data.respuesta && data.answerReadAt === null) {
            acknowledgeAnswer();
            fetch(`${BACKEND_URL}/api/prayer/${id}/answer-read`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
              body: JSON.stringify({ deviceId }),
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
  }, [id, acknowledgeAnswer]);

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
          <Animated.View entering={FadeIn.duration(Durations.fast).easing(Easing.bezier(...Easings.enter))}>
            <Text style={styles.errorText}>{error ?? 'Error desconocido'}</Text>
          </Animated.View>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backLinkWrap}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Text style={styles.backLink}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const config = getPrayerStatusConfig(detail.estado);
  const hasAnswer = Boolean(detail.respuesta);

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
        <Text style={styles.heading}>Mi petición</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeIn.duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
          style={styles.threadRow}
        >
          <View style={styles.nodeColumn}>
            <PrayerNode tone={detail.estado === 'CERRADA' ? 'muted' : 'waiting'} />
            {hasAnswer && <View style={styles.threadLine} />}
          </View>

          <View style={styles.threadBody}>
            <Text style={styles.momentLabel}>
              Tu petición ·{' '}
              <Text style={{ color: config.color }}>{config.label}</Text>
              {` · ${formatPrayerMoment(detail.createdAt)}`}
            </Text>
            <Text style={styles.message}>{detail.request}</Text>

            {!hasAnswer && (
              <Text style={styles.waitingNote}>
                Esta petición está esperando la respuesta del equipo. Te avisaremos
                aquí en cuanto la tengas.
              </Text>
            )}
          </View>
        </Animated.View>

        {hasAnswer && (
          <Animated.View
            entering={FadeIn.delay(80).duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
            style={styles.threadRow}
          >
            <View style={styles.nodeColumn}>
              <PrayerNode tone="answered" />
            </View>

            <View style={styles.threadBody}>
              <Text style={styles.momentLabel}>
                {`Respuesta del equipo · ${formatPrayerMoment(detail.answeredAt ?? detail.createdAt)}`}
              </Text>
              <Text style={[styles.message, styles.answerMessage]}>{detail.respuesta}</Text>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundAlt },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  errorText: { ...Typography.body, color: Colors.danger, textAlign: 'center' },
  backLink: { ...Typography.bodyStrong, color: Colors.accent },
  backLinkWrap: {
    minHeight: 48,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  heading: {
    ...Typography.screenTitle,
    color: Colors.text,
  },
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.lg },
  threadRow: { flexDirection: 'row', gap: Spacing.md },
  nodeColumn: { width: 18, alignItems: 'center' },
  threadLine: {
    width: 1,
    flex: 1,
    backgroundColor: Colors.borderGlass,
    marginTop: Spacing.xs,
  },
  threadBody: { flex: 1, gap: Spacing.sm },
  momentLabel: { ...Typography.caption, color: Colors.textMuted },
  message: { ...Typography.message, color: Colors.text },
  answerMessage: { color: Colors.textSoft },
  waitingNote: { ...Typography.body, color: Colors.textMuted },
});
