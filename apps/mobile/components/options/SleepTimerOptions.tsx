import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/components/ui/PressableScale';
import * as Haptics from 'expo-haptics';
import { SLEEP_PRESETS } from '@/hooks/useSleepTimer';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface SleepTimerOptionsProps {
  isActive: boolean;
  endTime: number | null;
  onSelectPreset: (minutes: number) => void;
  onCancel: () => void;
}

export function SleepTimerOptions({
  isActive,
  endTime,
  onSelectPreset,
  onCancel,
}: SleepTimerOptionsProps) {
  return (
    <View>
      <View style={styles.options}>
        {SLEEP_PRESETS.map((minutes) => (
          <PressableScale
            key={minutes}
            style={styles.option}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onSelectPreset(minutes);
            }}
          >
            <Text style={styles.optionText}>{minutes} min</Text>
            <Text style={styles.optionHint}>
              {minutes === 15 ? 'Siesta' : minutes === 30 ? 'Prédica' : minutes === 60 ? 'Noche' : 'Descanso'}
            </Text>
          </PressableScale>
        ))}
      </View>

      {isActive && endTime !== null && (
        <Text style={styles.endTime}>
          Termina a las {new Date(endTime).toLocaleTimeString()}
        </Text>
      )}

      {isActive && (
        <PressableScale
          style={[styles.option, styles.cancelOption]}
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            onCancel();
          }}
        >
          <Text style={[styles.optionText, { color: Colors.warning }]}>Cancelar temporizador</Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    minHeight: 48,
  },
  optionText: {
    ...Typography.bodyStrong,
    color: Colors.text,
    fontSize: 15,
  },
  optionHint: {
    ...Typography.caption,
    color: Colors.textFaint,
  },
  cancelOption: {
    backgroundColor: Colors.warningMuted,
    borderColor: Colors.warningGlow,
    marginTop: 4,
  },
  endTime: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
});
