import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SLEEP_PRESETS } from '@/hooks/useSleepTimer';
import { Colors, Typography } from '@/constants/theme';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';

interface SleepTimerModalProps {
  visible: boolean;
  isTimerActive: boolean;
  onClose: () => void;
  onSelectPreset: (minutes: number) => void;
  onCancel: () => void;
}

export function SleepTimerModal({
  visible,
  isTimerActive,
  onClose,
  onSelectPreset,
  onCancel,
}: SleepTimerModalProps) {
  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['42%', '56%']}>
      <Text style={styles.title}>Temporizador</Text>
      <Text style={styles.subtitle}>Apaga la radio automáticamente</Text>

      <View style={styles.options}>
        {SLEEP_PRESETS.map((minutes) => (
          <TouchableOpacity
            key={minutes}
            style={styles.option}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onSelectPreset(minutes);
            }}
          >
            <Text style={styles.optionText}>{minutes} min</Text>
            <Text style={styles.optionHint}>{minutes === 15 ? 'Siesta' : minutes === 30 ? 'Predica' : minutes === 60 ? 'Noche' : 'Descanso'}</Text>
          </TouchableOpacity>
        ))}

        {isTimerActive && (
          <TouchableOpacity
            style={[styles.option, styles.cancelOption]}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              onCancel();
            }}
          >
            <Text style={[styles.optionText, { color: Colors.tally }]}>Cancelar temporizador</Text>
          </TouchableOpacity>
        )}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    ...Typography.screenTitle,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
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
    backgroundColor: Colors.tallyMuted,
    borderColor: 'rgba(255,59,58,0.18)',
    marginTop: 4,
  },
});
