import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface ReminderBannerProps {
  onDismiss: () => void;
  onDismissForever: () => void;
  onConfigure: () => void;
}

export function ReminderBanner({
  onDismiss,
  onDismissForever,
  onConfigure,
}: ReminderBannerProps) {
  return (
    <View style={styles.reminderBanner}>
      <View style={styles.reminderContent}>
        <Ionicons name="notifications" size={20} color={Colors.accent} />
        <View style={styles.reminderTextContainer}>
          <Text style={styles.reminderTitle}>No te pierdas de nada</Text>
          <Text style={styles.reminderBody}>
            Configura alertas para tus programas favoritos.
          </Text>
        </View>
      </View>
      <View style={styles.reminderActions}>
        <TouchableOpacity onPress={onDismiss} style={styles.reminderButton}>
          <Text style={styles.reminderButtonTextFaint}>Luego</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDismissForever} style={styles.reminderButton}>
          <Text style={styles.reminderButtonTextFaint}>No volver a mostrar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reminderButtonAccent} onPress={onConfigure}>
          <Text style={styles.reminderButtonText}>Configurar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reminderBanner: {
    backgroundColor: Colors.surfaceElevated,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radii.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reminderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  reminderTextContainer: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  reminderTitle: {
    ...Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  reminderBody: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  reminderActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  reminderButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  reminderButtonTextFaint: {
    ...Typography.caption,
    color: Colors.textFaint,
    fontWeight: '500',
  },
  reminderButtonAccent: {
    backgroundColor: Colors.accentMuted,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.sm,
    justifyContent: 'center',
  },
  reminderButtonText: {
    ...Typography.caption,
    color: Colors.accent,
    fontWeight: '600',
  },
});
