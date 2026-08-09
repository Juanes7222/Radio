import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RadioAlarm } from '@/hooks/useAlarmClock';
import { Colors, Radii, Typography, Spacing } from '@/constants/theme';

const WEEKDAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function describeSchedule(alarm: RadioAlarm): string {
  if (alarm.days.length === 0) return 'Una vez';
  if (alarm.days.length === 7) return 'Todos los días';
  return alarm.days.map((day) => DAY_NAMES[day]).join(' · ');
}

interface AlarmModalProps {
  visible: boolean;
  alarms: RadioAlarm[];
  onClose: () => void;
  onSave: (input: { hour: number; minute: number; days: number[] }) => void;
  onRemove: (id: string) => void;
}

export function AlarmModal({ visible, alarms, onClose, onSave, onRemove }: AlarmModalProps) {
  const insets = useSafeAreaInsets();
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>([]);

  const resetForm = () => {
    setHour(7);
    setMinute(0);
    setDays([]);
  };

  const toggleDay = (day: number) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>Alarma de radio</Text>

          <View style={styles.timeRow}>
            <TouchableOpacity
              style={styles.stepper}
              onPress={() => setHour((h) => (h + 23) % 24)}
              activeOpacity={0.7}
              accessibilityLabel="Restar una hora"
            >
              <Ionicons name="remove" size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.timeText}>{formatTime(hour, minute)}</Text>
            <TouchableOpacity
              style={styles.stepper}
              onPress={() => setHour((h) => (h + 1) % 24)}
              activeOpacity={0.7}
              accessibilityLabel="Sumar una hora"
            >
              <Ionicons name="add" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.timeRow}>
            <TouchableOpacity
              style={styles.stepper}
              onPress={() => setMinute((m) => (m + 55) % 60)}
              activeOpacity={0.7}
              accessibilityLabel="Restar cinco minutos"
            >
              <Ionicons name="remove" size={20} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.minutesHint}>minutos</Text>
            <TouchableOpacity
              style={styles.stepper}
              onPress={() => setMinute((m) => (m + 5) % 60)}
              activeOpacity={0.7}
              accessibilityLabel="Sumar cinco minutos"
            >
              <Ionicons name="add" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.repeatSection}>
            <Text style={styles.sectionLabel}>Repetir</Text>
            <TouchableOpacity
              style={[styles.repeatOption, days.length === 0 && styles.repeatOptionActive]}
              activeOpacity={0.7}
              onPress={() => setDays([])}
            >
              <Text
                style={[styles.repeatOptionText, days.length === 0 && styles.repeatOptionTextActive]}
              >
                Una vez
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.repeatOption, days.length === 7 && styles.repeatOptionActive]}
              activeOpacity={0.7}
              onPress={() => setDays([0, 1, 2, 3, 4, 5, 6])}
            >
              <Text
                style={[styles.repeatOptionText, days.length === 7 && styles.repeatOptionTextActive]}
              >
                Todos los días
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.dayRow}>
            {WEEKDAY_LABELS.map((label, day) => (
              <TouchableOpacity
                key={day}
                style={[styles.dayChip, days.includes(day) && styles.dayChipActive]}
                activeOpacity={0.7}
                onPress={() => toggleDay(day)}
              >
                <Text style={[styles.dayChipText, days.includes(day) && styles.dayChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.saveBtn}
            activeOpacity={0.8}
            onPress={() => {
              onSave({ hour, minute, days });
              resetForm();
            }}
          >
            <Text style={styles.saveBtnText}>Guardar alarma</Text>
          </TouchableOpacity>

          {alarms.length > 0 && (
            <View style={styles.alarmList}>
              {alarms.map((alarm) => (
                <View key={alarm.id} style={styles.alarmRow}>
                  <View style={styles.alarmInfo}>
                    <Text style={styles.alarmTime}>{formatTime(alarm.hour, alarm.minute)}</Text>
                    <Text style={styles.alarmSchedule}>{describeSchedule(alarm)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => onRemove(alarm.id)}
                    activeOpacity={0.7}
                    accessibilityLabel="Eliminar alarma"
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#12121f',
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingTop: 12,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    ...Typography.screenTitle,
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  stepper: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeText: {
    ...Typography.screenTitle,
    color: Colors.text,
    fontSize: 40,
    minWidth: 110,
    textAlign: 'center',
  },
  minutesHint: {
    ...Typography.body,
    color: Colors.textAlt,
    minWidth: 110,
    textAlign: 'center',
    fontSize: 14,
  },
  repeatSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    ...Typography.body,
    color: Colors.textAlt,
    alignSelf: 'center',
    marginRight: Spacing.sm,
    fontSize: 14,
  },
  repeatOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
  },
  repeatOptionActive: {
    backgroundColor: Colors.accent,
  },
  repeatOptionText: {
    ...Typography.body,
    color: Colors.textAlt,
    fontSize: 13,
  },
  repeatOptionTextActive: {
    color: Colors.background,
    fontWeight: '700',
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  dayChipActive: {
    backgroundColor: Colors.accent,
  },
  dayChipText: {
    ...Typography.body,
    color: Colors.textAlt,
    fontSize: 13,
  },
  dayChipTextActive: {
    color: Colors.background,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radii.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  saveBtnText: {
    ...Typography.body,
    color: Colors.background,
    fontWeight: '700',
    fontSize: 15,
  },
  alarmList: {
    gap: Spacing.xs,
  },
  alarmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  alarmInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.md,
  },
  alarmTime: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  alarmSchedule: {
    ...Typography.body,
    color: Colors.textAlt,
    fontSize: 13,
  },
});
