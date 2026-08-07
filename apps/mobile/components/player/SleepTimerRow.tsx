import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface SleepTimerRowProps {
  display: string;
  onCancel: () => void;
}

export function SleepTimerRow({ display, onCancel }: SleepTimerRowProps) {
  return (
    <View style={styles.sleepRow}>
      <Ionicons name="timer-outline" size={14} color={Colors.warning} />
      <Text style={styles.sleepText}>Apagado en {display}</Text>
      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
      >
        <Text style={styles.cancelButtonText}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sleepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warningMuted,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radii.md,
    width: '100%',
  },
  sleepText: { ...Typography.body, color: Colors.warning, flex: 1 },
  cancelButton: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radii.sm,
  },
  cancelButtonPressed: { opacity: 0.7 },
  cancelButtonText: { ...Typography.caption, color: Colors.warning, fontWeight: '600' },
});
