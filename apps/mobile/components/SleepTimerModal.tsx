import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SLEEP_PRESETS } from '@/hooks/useSleepTimer';
import { Colors, Radii, Typography } from '@/constants/theme';

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
  const insets = useSafeAreaInsets();

  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>Temporizador de apagado</Text>

          {SLEEP_PRESETS.map((minutes) => (
            <TouchableOpacity
              key={minutes}
              style={styles.option}
              activeOpacity={0.7}
              onPress={() => onSelectPreset(minutes)}
            >
              <Text style={styles.optionText}>{minutes} minutos</Text>
            </TouchableOpacity>
          ))}

          {isTimerActive && (
            <TouchableOpacity
              style={[styles.option, styles.cancelOption]}
              activeOpacity={0.7}
              onPress={onCancel}
            >
              <Text style={[styles.optionText, { color: Colors.danger }]}>
                Cancelar temporizador
              </Text>
            </TouchableOpacity>
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
  option: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionText: {
    ...Typography.body,
    color: Colors.text,
    textAlign: 'center',
    fontSize: 16,
  },
  cancelOption: {
    borderBottomWidth: 0,
    marginTop: 4,
  },
});
