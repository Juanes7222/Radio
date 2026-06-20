import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAzuraCast } from '@radio/api';
import { BACKEND_URL } from '@/constants/api';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { useProgramSubscriptions } from '@/hooks/useProgramSubscriptions';
import { formatMediaTitle } from '@/lib/formatMedia';

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  notifyEnabled: boolean;
  onToggleCurrent: () => void;
  currentSongTitle?: string;
}

export function NotificationsModal({
  visible,
  onClose,
  notifyEnabled,
  onToggleCurrent,
  currentSongTitle,
}: NotificationsModalProps) {
  const insets = useSafeAreaInsets();
  const { fetchSchedule } = useAzuraCast({ apiBaseUrl: BACKEND_URL });
  const { subscribedPrograms, toggleSubscription } = useProgramSubscriptions();
  
  const [programs, setPrograms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      fetchSchedule().then((schedule) => {
        if (schedule) {
          // Extract unique programs to display in the list
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
  }, [visible, fetchSchedule]);

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
            {/* Current Track Section */}
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

            {/* Programs Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Programas Especiales</Text>
              {loading ? (
                <ActivityIndicator size="small" color={Colors.accent} style={styles.loader} />
              ) : programs.length > 0 ? (
                programs.map((program) => {
                  const isSubscribed = subscribedPrograms.includes(program);
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
    backgroundColor: Colors.surface,
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
  sectionTitle: {
    ...Typography.caption,
    color: Colors.accent,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
    letterSpacing: 1,
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
});