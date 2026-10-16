import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, Easing } from 'react-native-reanimated';
import { useMemo } from 'react';
import type { StreamQuality } from '@radio/types';
import { LiveBadge } from '@/components/LiveBadge';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { clamp, CONTENT_MAX_WIDTH, useResponsive } from '@/lib/responsive';

/**
 * Below this effective width the live badge shows only "EN VIVO" and drops the
 * listener count. The full row — notify button, badge with count (~165dp) and
 * the three quick actions, one of which carries the "128k" label (~165dp) —
 * needs ~380dp of content plus the section padding, so only the largest
 * phones have the slack. `effectiveWidth` is measured with the Dynamic Type
 * scale factored out: the badge text grows with it while the icon buttons do
 * not, exactly like the bottom tab bar.
 */
const LIVE_BADGE_LISTENERS_MIN_WIDTH = 430;

interface PlayerTopBarProps {
  notifyEnabled: boolean;
  sleepTimerActive: boolean;
  sleepTimerDisplay: string;
  showTooltip: boolean;
  listenersCount: number;
  quality: StreamQuality | null;
  onOpenNotifications: () => void;
  onOpenSleepTimer: () => void;
  onOpenAlarm: () => void;
  onOpenQuality: () => void;
}

interface TopBarMetrics {
  buttonSize: number;
  glyphSize: number;
  clusterGap: number;
  tooltipWidth: number;
  showListeners: boolean;
}

function useTopBarMetrics(): TopBarMetrics {
  const { width, fontScale, scale } = useResponsive();

  return useMemo(() => {
    const buttonSize = clamp(scale(44), 38, 46);
    const effectiveWidth = width / clamp(fontScale, 1, 1.4);
    return {
      buttonSize,
      glyphSize: clamp(scale(20), 18, 22),
      clusterGap: clamp(scale(8), 6, 10),
      tooltipWidth: clamp(scale(130), 116, 140),
      showListeners: effectiveWidth >= LIVE_BADGE_LISTENERS_MIN_WIDTH,
    };
  }, [fontScale, scale, width]);
}

export function PlayerTopBar({
  notifyEnabled,
  sleepTimerActive,
  sleepTimerDisplay,
  showTooltip,
  listenersCount,
  quality,
  onOpenNotifications,
  onOpenSleepTimer,
  onOpenAlarm,
  onOpenQuality,
}: PlayerTopBarProps) {
  const metrics = useTopBarMetrics();
  const styles = useMemo(() => createStyles(metrics), [metrics]);

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
            size={metrics.glyphSize}
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

      <LiveBadge listenersCount={listenersCount} showListeners={metrics.showListeners} />

      <View style={styles.actionsRight}>
        <TouchableOpacity
          onPress={onOpenQuality}
          style={styles.iconButton}
          activeOpacity={0.7}
          accessibilityLabel={quality ? `Calidad de audio, ${quality} kbps` : 'Calidad de audio'}
          accessibilityRole="button"
          accessibilityHint="Elige el balance entre consumo de datos y fidelidad"
        >
          {quality ? (
            <Text style={styles.qualityBadge}>{quality}k</Text>
          ) : (
            <Ionicons name="speedometer-outline" size={metrics.glyphSize} color={Colors.textFaint} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onOpenAlarm}
          style={styles.iconButton}
          activeOpacity={0.7}
          accessibilityLabel="Alarma de radio"
          accessibilityRole="button"
        >
          <Ionicons name="alarm-outline" size={metrics.glyphSize} color={Colors.textFaint} />
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
            size={metrics.glyphSize}
            color={sleepTimerActive ? Colors.warning : Colors.textFaint}
          />
          {sleepTimerActive && <Text style={styles.timerBadge}>{sleepTimerDisplay}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(metrics: TopBarMetrics) {
  const iconPadding = Math.round((metrics.buttonSize - metrics.glyphSize) / 2);

  return StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: 'center',
      marginBottom: Spacing.sm,
    },
    notifyWrapper: { zIndex: 10 },
    actionsRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: metrics.clusterGap,
    },
    iconButton: {
      minWidth: metrics.buttonSize,
      minHeight: metrics.buttonSize,
      padding: iconPadding,
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
      ...Typography.monoLarge,
      color: Colors.textFaint,
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
      width: metrics.tooltipWidth,
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
}
