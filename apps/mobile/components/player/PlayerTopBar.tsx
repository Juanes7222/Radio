import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiveBadge } from '@/components/LiveBadge';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface PlayerTopBarProps {
  notifyEnabled: boolean;
  sleepTimerActive: boolean;
  sleepTimerDisplay: string;
  showTooltip: boolean;
  listenersCount: number;
  onOpenNotifications: () => void;
  onOpenSleepTimer: () => void;
}

export function PlayerTopBar({
  notifyEnabled,
  sleepTimerActive,
  sleepTimerDisplay,
  showTooltip,
  listenersCount,
  onOpenNotifications,
  onOpenSleepTimer,
}: PlayerTopBarProps) {
  return (
    <View style={styles.topBar}>
      <View style={styles.notifyWrapper}>
        <TouchableOpacity
          onPress={onOpenNotifications}
          style={styles.iconButton}
          activeOpacity={0.7}
          accessibilityLabel="Configurar notificaciones"
        >
          <Ionicons
            name={notifyEnabled ? 'notifications' : 'notifications-outline'}
            size={20}
            color={notifyEnabled ? Colors.accent : Colors.textFaint}
          />
        </TouchableOpacity>

        {showTooltip && (
          <View style={styles.tooltipContainer}>
            <View style={styles.tooltipArrow} />
            <Text style={styles.tooltipText}>Configúralo aquí cuando desees</Text>
          </View>
        )}
      </View>

      <LiveBadge listenersCount={listenersCount} />

      <TouchableOpacity
        onPress={onOpenSleepTimer}
        style={[styles.iconButton, sleepTimerActive && styles.iconButtonActive]}
        activeOpacity={0.7}
        accessibilityLabel="Temporizador de apagado"
      >
        <Ionicons
          name="timer-outline"
          size={20}
          color={sleepTimerActive ? Colors.warning : Colors.textFaint}
        />
        {sleepTimerActive && <Text style={styles.timerBadge}>{sleepTimerDisplay}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.sm,
  },
  notifyWrapper: { zIndex: 10 },
  iconButton: {
    padding: 10,
    borderRadius: Radii.full,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconButtonActive: { backgroundColor: Colors.warningMuted },
  timerBadge: { ...Typography.caption, color: Colors.warning, fontWeight: '700' },
  tooltipContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radii.sm,
    width: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  tooltipArrow: {
    position: 'absolute',
    top: -6,
    left: 12,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: Colors.accent,
  },
  tooltipText: {
    ...Typography.caption,
    color: '#ffffff',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
});
