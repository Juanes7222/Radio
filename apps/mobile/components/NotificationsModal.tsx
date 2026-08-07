import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Platform,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchSchedule } from '@radio/api';
import { BACKEND_URL } from '@/constants/api';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { useProgramSubscriptions } from '@/hooks/useProgramSubscriptions';
import { formatMediaTitle, normalizeTitle } from '@/lib/formatMedia';

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
}: NotificationsModalProps) {  const insets = useSafeAreaInsets();
  
  
  // Extraer las nuevas funciones
  const { 
    subscribedPrograms, 
    toggleSubscription, 
    subscribeAll, 
    unsubscribeAll 
  } = useProgramSubscriptions();
  
  const [programs, setPrograms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      fetchSchedule(BACKEND_URL).then((schedule) => {
        if (schedule) {
          const uniquePrograms = Array.from(
            new Set(schedule.map((item) => item.title))
          ).filter(title => {
            const normalized = title.toLowerCase();
            return !['contenido variado', 'musica', 'jingles', 'jingle'].some(ex => normalized.includes(ex));
          });
          setPrograms(uniquePrograms);
        }
        setLoading(false);
      });
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        
        <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Mis Notificaciones</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {Platform.OS === 'android' && exactAlarmGranted === false && (
              <View style={styles.exactAlarmBanner}>
                <Ionicons name="alarm-outline" size={20} color={Colors.warning} />
                <View style={styles.exactAlarmTextContainer}>
                  <Text style={styles.exactAlarmTitle}>Avisos más puntuales</Text>
                  <Text style={styles.exactAlarmBody}>
                    Las alertas de programas pueden llegar con unos minutos de retraso. Activa "Alarmas y recordatorios" en los ajustes para que lleguen a la hora exacta.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => Linking.openSettings()}
                  style={styles.exactAlarmButton}
                >
                  <Text style={styles.exactAlarmButtonText}>Activar</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sonando Ahora</Text>
              <View style={styles.row}>
                <View style={styles.rowTextContainer}>
                  <Text style={styles.rowTitle}>Avisarme de esta pista</Text>
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {currentSongTitle || 'Desconocido'}
                  </Text>
                </View>
                <Switch
                  value={notifyEnabled}
                  onValueChange={onToggleCurrent}
                  trackColor={{ false: Colors.border, true: Colors.accent }}
                  thumbColor={Platform.OS === 'ios' ? '#fff' : notifyEnabled ? '#fff' : '#f4f3f4'}
                />
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Programas Especiales</Text>
                {programs.length > 0 && (
                  <View style={styles.bulkActions}>
                    <TouchableOpacity onPress={() => subscribeAll(programs)}>
                      <Text style={styles.bulkText}>Todas</Text>
                    </TouchableOpacity>
                    <Text style={styles.bulkSeparator}>·</Text>
                    <TouchableOpacity onPress={unsubscribeAll}>
                      <Text style={styles.bulkText}>Ninguna</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {loading ? (
                <ActivityIndicator size="small" color={Colors.accent} style={styles.loader} />
              ) : programs.length > 0 ? (
                programs.map((program) => {
                    const isSubscribed = subscribedPrograms.some(
                      sub => normalizeTitle(sub) === normalizeTitle(program)
                    );
                    const { title } = formatMediaTitle(program);
                    
                    return (
                      <View key={program} style={styles.row}>
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>{title}</Text>
                        </View>
                        <Switch
                          value={isSubscribed}
                          onValueChange={() => toggleSubscription(program)}
                          trackColor={{ false: Colors.border, true: Colors.accent }}
                          thumbColor={Platform.OS === 'ios' ? '#fff' : isSubscribed ? '#fff' : '#f4f3f4'}
                        />
                      </View>
                    );
                  })
              ) : (
                <Text style={styles.emptyText}>No hay programas disponibles.</Text>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  content: {
    backgroundColor: '#12121f',
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.screenTitle,
    color: Colors.text,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  scrollArea: {
    flexGrow: 0,
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
    ...Typography.caption,
    color: Colors.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bulkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  bulkText: {
    ...Typography.caption,
    color: Colors.accent,
    fontWeight: '600',
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
  rowTextContainer: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  rowTitle: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '500',
  },
  rowSubtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  loader: {
    marginVertical: Spacing.lg,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  exactAlarmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warningMuted,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  exactAlarmTextContainer: {
    flex: 1,
  },
  exactAlarmTitle: {
    ...Typography.body,
    color: Colors.warning,
    fontWeight: '700',
  },
  exactAlarmBody: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  exactAlarmButton: {
    backgroundColor: 'rgba(245,158,11,0.25)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radii.sm,
  },
  exactAlarmButtonText: {
    ...Typography.caption,
    color: Colors.warning,
    fontWeight: '700',
  },
});