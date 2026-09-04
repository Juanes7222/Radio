import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TimeWheelPicker } from '@/components/alarm/TimeWheelPicker';
import type { AlarmInput, RadioAlarm } from '@/hooks/useAlarmClock';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';

const WEEKDAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

function describeSchedule(days: number[]): string {
  const sorted = [...days].sort();
  if (sorted.length === 0) return 'Una vez';
  if (sorted.length === 7) return 'Todos los días';
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return 'Fines de semana';
  if (sorted.every((day) => day >= 1 && day <= 5)) return 'Entre semana';
  return sorted.map((day) => DAY_NAMES[day]).join(' · ');
}

interface AlarmForm {
  hour: number;
  minute: number;
  days: number[];
  label: string;
}

const DEFAULT_FORM: AlarmForm = { hour: 7, minute: 0, days: [], label: '' };

interface AlarmModalProps {
  visible: boolean;
  alarms: RadioAlarm[];
  onClose: () => void;
  onSave: (input: AlarmInput) => void;
  onUpdate: (id: string, input: AlarmInput) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}

export function AlarmModal({
  visible,
  alarms,
  onClose,
  onSave,
  onUpdate,
  onRemove,
  onToggle,
}: AlarmModalProps) {
  const [form, setForm] = useState<AlarmForm>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [repeatExpanded, setRepeatExpanded] = useState(false);

  useEffect(() => {
    if (!visible) {
      setEditingId(null);
      setShowEditor(false);
      setForm(DEFAULT_FORM);
      setRepeatExpanded(false);
    }
  }, [visible]);

  const openEditor = (alarm: RadioAlarm) => {
    Haptics.selectionAsync().catch(() => {});
    setForm({
      hour: alarm.hour,
      minute: alarm.minute,
      days: alarm.days,
      label: alarm.label ?? '',
    });
    setRepeatExpanded(false);
    setEditingId(alarm.id);
    setShowEditor(true);
  };

  const openNewEditor = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setForm(DEFAULT_FORM);
    setRepeatExpanded(false);
    setEditingId(null);
    setShowEditor(true);
  };

  const toggleDay = (day: number) => {
    Haptics.selectionAsync().catch(() => {});
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day].sort(),
    }));
  };

  const save = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const input: AlarmInput = {
      hour: form.hour,
      minute: form.minute,
      days: form.days,
      label: form.label.trim() || undefined,
    };
    if (editingId) {
      onUpdate(editingId, input);
    } else {
      onSave(input);
    }
    setEditingId(null);
    setShowEditor(false);
    setForm(DEFAULT_FORM);
    setRepeatExpanded(false);
  };

  const isWeekend = form.days.length === 2 && [0, 6].every((d) => form.days.includes(d));
  const isEveryDay = form.days.length === 7;

  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={showEditor ? ['88%', '96%'] : ['72%', '86%']}>
      {!showEditor ? (
        <View style={styles.listView}>
          <View style={styles.listHeader}>
            <Text style={styles.title}>Recordatorios</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {alarms.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="alarm-outline" size={28} color={Colors.textFaint} />
                </View>
                <Text style={styles.emptyText}>Aún no tienes recordatorios.</Text>
                <Text style={styles.emptyHint}>Programa la radio como tu despertador</Text>
              </View>
            ) : (
              alarms.map((alarm) => (
                <View key={alarm.id} style={styles.alarmRow}>
                  <TouchableOpacity
                    style={styles.alarmMain}
                    activeOpacity={0.6}
                    onPress={() => openEditor(alarm)}
                    accessibilityLabel={`Editar recordatorio de las ${formatTime(alarm.hour, alarm.minute)}`}
                  >
                    <Text
                      style={[
                        styles.alarmTime,
                        !alarm.enabled && styles.alarmTimeDisabled,
                      ]}
                    >
                      {formatTime(alarm.hour, alarm.minute)}
                    </Text>
                    <Text
                      style={[styles.alarmSchedule, !alarm.enabled && styles.alarmScheduleDisabled]}
                      numberOfLines={1}
                    >
                      {alarm.label ? `${alarm.label} · ${describeSchedule(alarm.days)}` : describeSchedule(alarm.days)}
                    </Text>
                  </TouchableOpacity>
                  <Switch
                    value={alarm.enabled}
                    onValueChange={(enabled) => {
                      Haptics.selectionAsync().catch(() => {});
                      onToggle(alarm.id, enabled);
                    }}
                    trackColor={{ false: Colors.border, true: Colors.signal }}
                    thumbColor="#fff"
                    accessibilityLabel={alarm.enabled ? 'Apagar recordatorio' : 'Encender recordatorio'}
                  />
                </View>
              ))
            )}
          </ScrollView>

          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.7}
            onPress={openNewEditor}
            accessibilityLabel="Nuevo recordatorio"
          >
            <View style={styles.addIconWrap}>
              <Ionicons name="add" size={20} color={Colors.textOnSignal} />
            </View>
            <Text style={styles.addButtonText}>Nuevo recordatorio</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.editorView}>
          <View style={styles.editorNav}>
            <TouchableOpacity
              onPress={() => {
                setEditingId(null);
                setShowEditor(false);
              }}
              hitSlop={8}
            >
              <Text style={styles.navButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Recordatorio</Text>
            <TouchableOpacity onPress={save} hitSlop={8} accessibilityLabel="Guardar recordatorio">
              <Text style={[styles.navButtonText, styles.saveButtonText]}>Guardar</Text>
            </TouchableOpacity>
          </View>

          <TimeWheelPicker
            hour={form.hour}
            minute={form.minute}
            onHourChange={(hour) => setForm((prev) => ({ ...prev, hour }))}
            onMinuteChange={(minute) => setForm((prev) => ({ ...prev, minute }))}
          />

          <ScrollView
            style={styles.editorScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.settingsCard}>
              <TouchableOpacity
                style={styles.settingsRow}
                activeOpacity={0.6}
                onPress={() => setRepeatExpanded((expanded) => !expanded)}
                accessibilityLabel="Configurar repetición"
              >
                <Text style={styles.settingsLabel}>Repetir</Text>
                <View style={styles.settingsValue}>
                  <Text style={styles.settingsValueText}>{describeSchedule(form.days)}</Text>
                  <Ionicons
                    name={repeatExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.textFaint}
                  />
                </View>
              </TouchableOpacity>

              {repeatExpanded && (
                <View style={styles.repeatPanel}>
                  <View style={styles.shortcutRow}>
                    <TouchableOpacity
                      style={[styles.shortcutChip, form.days.length === 0 && styles.chipActive]}
                      activeOpacity={0.7}
                      onPress={() => setForm((prev) => ({ ...prev, days: [] }))}
                    >
                      <Text
                        style={[
                          styles.shortcutChipText,
                          form.days.length === 0 && styles.chipTextActive,
                        ]}
                      >
                        Una vez
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.shortcutChip, isWeekend && styles.chipActive]}
                      activeOpacity={0.7}
                      onPress={() => setForm((prev) => ({ ...prev, days: [0, 6] }))}
                    >
                      <Text style={[styles.shortcutChipText, isWeekend && styles.chipTextActive]}>
                        Fines de semana
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.shortcutChip, isEveryDay && styles.chipActive]}
                      activeOpacity={0.7}
                      onPress={() => setForm((prev) => ({ ...prev, days: ALL_DAYS }))}
                    >
                      <Text
                        style={[
                          styles.shortcutChipText,
                          isEveryDay && styles.chipTextActive,
                        ]}
                      >
                        Todos los días
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.dayRow}>
                    {WEEKDAY_LABELS.map((label, day) => (
                      <TouchableOpacity
                        key={day}
                        style={[
                          styles.dayChip,
                          form.days.includes(day) && styles.chipActive,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => toggleDay(day)}
                      >
                        <Text
                          style={[
                            styles.dayChipText,
                            form.days.includes(day) && styles.chipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.settingsRow}>
                <Text style={styles.settingsLabel}>Etiqueta</Text>
                <TextInput
                  style={styles.labelInput}
                  value={form.label}
                  onChangeText={(label) => setForm((prev) => ({ ...prev, label }))}
                  placeholder="Recordatorio de radio"
                  placeholderTextColor={Colors.textFaint}
                  maxLength={40}
                  returnKeyType="done"
                  accessibilityLabel="Etiqueta de la alarma"
                />
              </View>
            </View>

            {editingId && (
              <TouchableOpacity
                style={styles.deleteButton}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
                  onRemove(editingId);
                  setEditingId(null);
                  setShowEditor(false);
                  setForm(DEFAULT_FORM);
                }}
                accessibilityLabel="Eliminar alarma"
              >
                <Text style={styles.deleteButtonText}>Eliminar alarma</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  listView: {
    flex: 1,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.screenTitle,
    color: Colors.text,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  listScroll: {
    flex: 1,
  },
  emptyWrap: { alignItems: 'center', paddingVertical: Spacing.xl, gap: 8 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
    fontWeight: '600' as const,
    textAlign: 'center',
  },
  emptyHint: { ...Typography.caption, color: Colors.textFaint, textAlign: 'center' },
  alarmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderGlass,
  },
  alarmMain: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  alarmTime: {
    color: Colors.textBright,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    fontFamily: Typography.mono.fontFamily,
  },
  alarmTimeDisabled: {
    color: Colors.textFaint,
  },
  alarmSchedule: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  alarmScheduleDisabled: {
    color: Colors.textFaint,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xs,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  addIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.signal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '700',
    fontSize: 15,
  },
  editorView: {
    flex: 1,
  },
  editorNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  navButtonText: {
    ...Typography.body,
    color: Colors.signal,
    fontSize: 16,
  },
  saveButtonText: {
    fontWeight: '700',
  },
  editorScroll: {
    flex: 1,
  },
  settingsCard: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: Radii.lg,
    overflow: 'hidden',
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderGlass,
  },
  settingsLabel: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 15,
  },
  settingsValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  settingsValueText: {
    ...Typography.body,
    color: Colors.textMuted,
    fontSize: 14,
  },
  repeatPanel: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderGlass,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  shortcutRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  shortcutChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  shortcutChipText: {
    ...Typography.body,
    color: Colors.textMuted,
    fontSize: 13,
  },
  chipActive: {
    backgroundColor: Colors.signal,
    borderColor: Colors.signal,
  },
  chipTextActive: {
    color: Colors.textOnSignal,
    fontWeight: '700',
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayChipText: {
    ...Typography.body,
    color: Colors.textMuted,
    fontSize: 13,
  },
  labelInput: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 14,
    textAlign: 'right',
    flex: 1,
    marginLeft: Spacing.md,
    paddingVertical: 0,
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  deleteButtonText: {
    ...Typography.body,
    color: Colors.tally,
    fontSize: 15,
    fontWeight: '600',
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
