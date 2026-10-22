import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { SleepTimerOptions } from '@/components/options/SleepTimerOptions';

interface SleepTimerSheetProps {
  visible: boolean;
  onClose: () => void;
  isActive: boolean;
  endTime: number | null;
  onSelectPreset: (minutes: number) => void;
  onCancel: () => void;
}

/**
 * Hoja corta del temporizador de apagado. Su único punto de entrada es la
 * burbuja de la barra fija; nunca vive dentro de la hoja de opciones.
 */
export function SleepTimerSheet({
  visible,
  onClose,
  isActive,
  endTime,
  onSelectPreset,
  onCancel,
}: SleepTimerSheetProps) {
  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['42%', '56%']}>
      <View style={styles.header}>
        <Text style={styles.title}>Apagar la radio</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={8} accessibilityLabel="Cerrar">
          <Ionicons name="close" size={22} color={Colors.textMuted} />
        </TouchableOpacity>
      </View>
      <SleepTimerOptions isActive={isActive} endTime={endTime} onSelectPreset={onSelectPreset} onCancel={onCancel} />
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
});
