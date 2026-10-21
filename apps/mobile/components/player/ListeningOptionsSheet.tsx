import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { NotificationsOptions } from '@/components/options/NotificationsOptions';
import { SleepTimerOptions } from '@/components/options/SleepTimerOptions';
import { QualityOptions } from '@/components/options/QualityOptions';
import type { StreamQuality } from '@radio/types';

interface ListeningOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  notifyEnabled: boolean;
  onToggleCurrent: () => void;
  currentSongTitle?: string;
  exactAlarmGranted?: boolean | null;
  timerEndTime: number | null;
  onSelectPreset: (minutes: number) => void;
  onCancelTimer: () => void;
  quality: StreamQuality | null;
  availableQualities: StreamQuality[];
  onSelectQuality: (q: StreamQuality) => void;
  onOpenAlarms: () => void;
}

export function ListeningOptionsSheet({
  visible,
  onClose,
  notifyEnabled,
  onToggleCurrent,
  currentSongTitle,
  exactAlarmGranted,
  timerEndTime,
  onSelectPreset,
  onCancelTimer,
  quality,
  availableQualities,
  onSelectQuality,
  onOpenAlarms,
}: ListeningOptionsSheetProps) {
  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['78%', '92%']}>
      <View style={styles.header}>
        <Text style={styles.title}>Opciones de escucha</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8}>
          <Ionicons name="close" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      <BottomSheetScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notificaciones</Text>
          <NotificationsOptions
            notifyEnabled={notifyEnabled}
            onToggleCurrent={onToggleCurrent}
            currentSongTitle={currentSongTitle}
            exactAlarmGranted={exactAlarmGranted}
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Temporizador</Text>
          <SleepTimerOptions
            isActive={timerEndTime !== null}
            endTime={timerEndTime}
            onSelectPreset={onSelectPreset}
            onCancel={onCancelTimer}
          />
        </View>
        {availableQualities.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Calidad</Text>
            <QualityOptions
              currentQuality={quality}
              availableQualities={availableQualities}
              onSelect={onSelectQuality}
            />
          </View>
        )}
        <View style={styles.section}>
          <TouchableOpacity
            onPress={() => {
              onClose();
              onOpenAlarms();
            }}
            style={styles.alarmRow}
            activeOpacity={0.8}
            accessibilityLabel="Alarmas de radio"
            accessibilityRole="button"
            accessibilityHint="Abre el editor de alarmas de radio"
          >
            <Ionicons name="alarm-outline" size={18} color={Colors.signal} />
            <Text style={styles.alarmText}>Alarmas de radio</Text>
            <Ionicons name="chevron-forward-outline" size={16} color={Colors.textFaint} />
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
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
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.textMuted,
  },
  alarmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    minHeight: 44,
  },
  alarmText: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
    marginHorizontal: Spacing.md,
  },
});
