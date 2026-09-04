import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { fetchSchedule, fetchScheduleCategories } from '@radio/api';
import type { ScheduleItem } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { useProgramSubscriptions } from '@/hooks/useProgramSubscriptions';
import { openExactAlarmSettings } from '@/modules/exact-alarms';
import { formatMediaTitle, normalizeTitle } from '@/lib/formatMedia';
import { SCHEDULE_CACHE_TTL_MS, readScheduleCache, writeScheduleCache } from '@/lib/scheduleCache';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  notifyEnabled: boolean;
  onToggleCurrent: () => void;
  currentSongTitle?: string;
  exactAlarmGranted?: boolean | null;
}

export function NotificationsModal({
  visible,
  onClose,
  notifyEnabled,
  onToggleCurrent,
  currentSongTitle,
  exactAlarmGranted,
}: NotificationsModalProps) {
  const { 
    subscribedPrograms, 
    toggleSubscription, 
    subscribeAll, 
    unsubscribeAll 
  } = useProgramSubscriptions();
  
  const [programs, setPrograms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    setLoading(true);

    const extractPrograms = (schedule: ScheduleItem[]) => {
      const uniquePrograms = Array.from(
        new Set(schedule.map((item) => item.title))
      ).filter(title => {
        const normalized = title.toLowerCase();
        return !['contenido variado', 'musica', 'jingles', 'jingle'].some(ex => normalized.includes(ex));
      });
      if (!cancelled) setPrograms(uniquePrograms);
    };

    (async () => {
      const cached = await readScheduleCache();
      if (cancelled) return;

      if (cached) {
        extractPrograms(cached.schedule);
        if (Date.now() - cached.timestamp < SCHEDULE_CACHE_TTL_MS) {
          setLoading(false);
          return;
        }
      }

      try {
        const [schedule, categories] = await Promise.all([
          fetchSchedule(BACKEND_URL),
          fetchScheduleCategories(BACKEND_URL),
        ]);
        if (cancelled) return;
        if (schedule) {
          extractPrograms(schedule);
          if (categories) {
            await writeScheduleCache({
              schedule,
              categories,
              timestamp: Date.now(),
            });
          }
        }
      } catch (err) {
        console.error('Error fetching schedule for notifications:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['72%', '85%']}>
      <View style={styles.header}>
        <Text style={styles.title}>Notificaciones</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
          <Ionicons name="close" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        {Platform.OS === 'android' && exactAlarmGranted === false && (
          <View style={styles.exactAlarmBanner}>
            <View style={styles.exactAlarmIcon}>
              <Ionicons name="alarm-outline" size={18} color={Colors.signal} />
            </View>
            <View style={styles.exactAlarmTextContainer}>
              <Text style={styles.exactAlarmTitle}>Avisos más puntuales</Text>
              <Text style={styles.exactAlarmBody}>
                Las alertas pueden llegar con retraso. Activa "Alarmas y recordatorios" para hora exacta.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                openExactAlarmSettings();
              }}
              style={styles.exactAlarmButton}
            >
              <Text style={styles.exactAlarmButtonText}>Activar</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sonando ahora</Text>
          <View style={[styles.row, styles.rowCard]}>
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Avisarme de esta pista</Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {currentSongTitle || 'Desconocido'}
              </Text>
            </View>
            <Switch
              value={notifyEnabled}
              onValueChange={() => {
                Haptics.selectionAsync().catch(() => {});
                onToggleCurrent();
              }}
              trackColor={{ false: Colors.borderGlass, true: Colors.signal }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Programas</Text>
            {programs.length > 0 && (
              <View style={styles.bulkActions}>
                <TouchableOpacity onPress={() => { Haptics.selectionAsync().catch(() => {}); subscribeAll(programs); }}>
                  <Text style={styles.bulkText}>Todas</Text>
                </TouchableOpacity>
                <Text style={styles.bulkSeparator}>·</Text>
                <TouchableOpacity onPress={() => { Haptics.selectionAsync().catch(() => {}); unsubscribeAll(); }}>
                  <Text style={styles.bulkText}>Ninguna</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="small" color={Colors.signal} />
              <Text style={styles.loaderText}>Cargando programas…</Text>
            </View>
          ) : programs.length > 0 ? (
            programs.map((program) => {
                const isSubscribed = subscribedPrograms.some(
                  sub => normalizeTitle(sub) === normalizeTitle(program)
                );
                const { title } = formatMediaTitle(program);
                
                return (
                  <View key={program} style={[styles.row, styles.rowCard]}>
                    <View style={styles.rowTextContainer}>
                      <Text style={styles.rowTitle}>{title}</Text>
                    </View>
                    <Switch
                      value={isSubscribed}
                      onValueChange={() => {
                        Haptics.selectionAsync().catch(() => {});
                        toggleSubscription(program);
                      }}
                      trackColor={{ false: Colors.borderGlass, true: Colors.signal }}
                      thumbColor="#fff"
                    />
                  </View>
                );
              })
          ) : (
            <Text style={styles.emptyText}>No hay programas disponibles.</Text>
          )}
        </View>
      </ScrollView>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderGlass,
  },
  title: {
    ...Typography.screenTitle,
    color: Colors.text,
  },
  closeButton: {
    padding: Spacing.xs,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  scrollArea: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.eyebrow,
    color: Colors.signal,
  },
  bulkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  bulkText: {
    ...Typography.caption,
    color: Colors.signal,
    fontWeight: '700',
  },
  bulkSeparator: {
    ...Typography.caption,
    color: Colors.textFaint,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  rowCard: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    marginBottom: 8,
  },
  rowTextContainer: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  rowTitle: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  rowSubtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderGlass,
    marginVertical: Spacing.md,
  },
  loaderWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: Spacing.md },
  loaderText: { ...Typography.caption, color: Colors.textMuted },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  exactAlarmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.signalMuted,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,181,71,0.18)',
  },
  exactAlarmIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,181,71,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exactAlarmTextContainer: {
    flex: 1,
  },
  exactAlarmTitle: {
    ...Typography.bodyStrong,
    color: Colors.signal,
    fontSize: 13,
  },
  exactAlarmBody: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  exactAlarmButton: {
    backgroundColor: Colors.signal,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: Radii.full,
  },
  exactAlarmButtonText: {
    ...Typography.captionStrong,
    color: Colors.textOnSignal,
  },
});
