import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { Easings } from '@/constants/motion';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { NotificationsOptions } from '@/components/options/NotificationsOptions';
import { QualityOptions } from '@/components/options/QualityOptions';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { StreamQuality } from '@radio/types';

const QUALITY_LABELS: Record<StreamQuality, string> = {
  '64': 'Baja (ahorra datos)',
  '128': 'Media',
  '320': 'Alta',
};

type OptionsView = 'index' | 'quality' | 'notifications';

const FADE_MS = 180;

interface ListeningOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  notifyEnabled: boolean;
  onToggleCurrent: () => void;
  currentSongTitle?: string;
  exactAlarmGranted?: boolean | null;
  alarmsCount?: number;
  quality: StreamQuality | null;
  availableQualities: StreamQuality[];
  onSelectQuality: (q: StreamQuality) => void;
  onOpenAlarms: () => void;
}

function qualityLabel(quality: StreamQuality | null): string {
  return quality ? QUALITY_LABELS[quality] : 'Sin datos';
}

function alarmLabel(count?: number): string {
  if (count === undefined || count === 0) return 'Sin alarmas';
  return count === 1 ? 'Una alarma' : `${count} alarmas`;
}

interface IndexRowProps {
  label: string;
  value: string;
  onPress: () => void;
}

/**
 * Una fila del índice: etiqueta con su valor debajo, chevron a la derecha.
 * 48dp de alto para cumplir el objetivo de toque, y al menos 8dp entre filas.
 */
function IndexRow({ label, value, onPress }: IndexRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.8}
      hitSlop={8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={`Abre ${label.toLowerCase()}`}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward-outline" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

export function ListeningOptionsSheet({
  visible,
  onClose,
  notifyEnabled,
  onToggleCurrent,
  currentSongTitle,
  exactAlarmGranted,
  alarmsCount,
  quality,
  availableQualities,
  onSelectQuality,
  onOpenAlarms,
}: ListeningOptionsSheetProps) {
  const reduceMotion = useReducedMotion();
  const fadeMs = reduceMotion ? 0 : FADE_MS;
  const [view, setView] = useState<OptionsView>('index');
  const viewRef = useRef(view);
  viewRef.current = view;

  const showQuality = availableQualities.length > 1;

  // Cada apertura de la hoja arranca en el índice.
  useEffect(() => {
    if (visible) setView('index');
  }, [visible]);

  // Android: Atrás vuelve del detalle al índice y, desde el índice, cierra
  // la hoja. Sólo se suscribe mientras la hoja está visible.
  const onBack = useCallback((): boolean => {
    if (viewRef.current !== 'index') {
      setView('index');
      return true;
    }
    onClose();
    return true;
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, [visible, onBack]);

  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['68%', '86%']}>
      <View style={styles.pages}>
        {view === 'index' ? (
          <Animated.View
            key="index"
            style={[styles.page, { pointerEvents: 'auto' }]}
            entering={FadeIn.duration(fadeMs).easing(Easing.bezier(...Easings.enter))}
            exiting={FadeOut.duration(fadeMs).easing(Easing.bezier(...Easings.exit))}
          >
            <View style={styles.rows}>
              {showQuality && (
                <IndexRow
                  label="Calidad del audio"
                  value={qualityLabel(quality)}
                  onPress={() => setView('quality')}
                />
              )}
              <IndexRow
                label="Notificaciones"
                value={notifyEnabled ? 'Activadas' : 'Desactivadas'}
                onPress={() => setView('notifications')}
              />
              <IndexRow
                label="Alarmas de radio"
                value={alarmLabel(alarmsCount)}
                onPress={() => {
                  onClose();
                  onOpenAlarms();
                }}
              />
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            key="detail"
            style={[styles.page, { pointerEvents: 'auto' }]}
            entering={FadeIn.duration(fadeMs).easing(Easing.bezier(...Easings.enter))}
            exiting={FadeOut.duration(fadeMs).easing(Easing.bezier(...Easings.exit))}
          >
            <View style={styles.detail}>
              <TouchableOpacity
                style={styles.backRow}
                activeOpacity={0.8}
                hitSlop={8}
                onPress={() => setView('index')}
                accessibilityLabel="Volver a opciones de escucha"
                accessibilityRole="button"
              >
                <Ionicons name="chevron-back-outline" size={20} color={Colors.signal} />
                <Text style={styles.backText}>Opciones de escucha</Text>
              </TouchableOpacity>
              <BottomSheetScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                {view === 'quality' ? (
                  <QualityOptions
                    currentQuality={quality}
                    availableQualities={availableQualities}
                    onSelect={onSelectQuality}
                  />
                ) : (
                  <NotificationsOptions
                    notifyEnabled={notifyEnabled}
                    onToggleCurrent={onToggleCurrent}
                    currentSongTitle={currentSongTitle}
                    exactAlarmGranted={exactAlarmGranted}
                  />
                )}
              </BottomSheetScrollView>
            </View>
          </Animated.View>
        )}
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  pages: {
    flex: 1,
  },
  page: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  rows: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    minHeight: 48,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    marginBottom: Spacing.sm,
  },
  rowText: {
    flex: 1,
    marginRight: Spacing.md,
  },
  rowLabel: {
    ...Typography.bodyStrong,
    color: Colors.text,
  },
  rowValue: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  detail: {
    flex: 1,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    minHeight: 48,
  },
  backText: {
    ...Typography.bodyStrong,
    color: Colors.text,
    marginLeft: Spacing.xs,
  },
  scroll: {
    flex: 1,
  },
});
