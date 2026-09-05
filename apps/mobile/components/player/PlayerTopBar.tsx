import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, Easing } from 'react-native-reanimated';
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
  onOpenAlarm: () => void;
}

export function PlayerTopBar({
  notifyEnabled,
  sleepTimerActive,
  sleepTimerDisplay,
  showTooltip,
  listenersCount,
  onOpenNotifications,
  onOpenSleepTimer,
  onOpenAlarm,
}: PlayerTopBarProps) {
  return (
    <View style={styles.topBar}>
      <View style={styles.notifyWrapper}>
        <TouchableOpacity
          onPress={onOpenNotifications}
          style={styles.iconButton}
          activeOpacity={0.7}
          accessibilityLabel="Configurar notificaciones"
          accessibilityRole="button"
        >
          <Ionicons
            name={notifyEnabled ? 'notifications' : 'notifications-outline'}
            size={20}
            color={notifyEnabled ? Colors.signal : Colors.textFaint}
          />
        </TouchableOpacity>

        {showTooltip && (
          <Animated.View
            entering={FadeIn.duration(180).easing(Easing.bezier(0.16, 1, 0.3, 1))}
            exiting={FadeOut.duration(120)}
            style={styles.tooltipContainer}
          >
            <View style={styles.tooltipArrow} />
            <Text style={styles.tooltipText}>Configúralo aquí cuando desees</Text>
          </Animated.View>
        )}
      </View>

      <LiveBadge listenersCount={listenersCount} />

      <View style={styles.actionsRight}>
        <TouchableOpacity
          onPress={onOpenAlarm}
          style={styles.iconButton}
          activeOpacity={0.7}
          accessibilityLabel="Alarma de radio"
          accessibilityRole="button"
        >
          <Ionicons name="alarm-outline" size={20} color={Colors.textFaint} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onOpenSleepTimer}
          style={[styles.iconButton, sleepTimerActive && styles.iconButtonActive]}
          activeOpacity={0.7}
          accessibilityLabel={sleepTimerActive ? `Temporizador de apagado activo, ${sleepTimerDisplay}` : 'Temporizador de apagado'}
          accessibilityRole="button"
          accessibilityState={{ selected: sleepTimerActive }}
        >
          <Ionicons
            name="timer-outline"
            size={20}
            color={sleepTimerActive ? Colors.warning : Colors.textFaint}
          />
          {sleepTimerActive && <Text style={styles.timerBadge}>{sleepTimerDisplay}</Text>}
        </TouchableOpacity>
      </View>
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
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    padding: 10,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceGlass,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  iconButtonActive: { backgroundColor: Colors.signalMuted, borderColor: Colors.signalGlow },
  qualityBadge: {
    ...Typography.caption,
    color: Colors.textFaint,
    fontWeight: '600',
  },
  timerBadge: { ...Typography.caption, color: Colors.signal, fontWeight: '700' },
  tooltipContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 8,
    backgroundColor: Colors.signal,
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
    borderBottomColor: Colors.signal,
  },
  tooltipText: {
    ...Typography.caption,
    color: Colors.textOnSignal,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
});
