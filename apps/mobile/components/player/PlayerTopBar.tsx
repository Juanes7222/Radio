import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing } from '@/constants/theme';
import { LiveBadge } from '@/components/LiveBadge';

/**
 * With only two elements in the bar there is always room for the listener
 * count: the old 430dp threshold existed because five elements needed ~380dp
 * of content plus padding. The bar now shows EN VIVO plus one options button.
 */
interface PlayerTopBarProps {
  listenersCount: number;
  onOpenOptions: () => void;
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceGlass,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
});

export function PlayerTopBar({ listenersCount, onOpenOptions }: PlayerTopBarProps) {
  return (
    <View style={styles.topBar}>
      <LiveBadge listenersCount={listenersCount} showListeners={true} />
      <TouchableOpacity
        onPress={onOpenOptions}
        style={styles.iconButton}
        activeOpacity={0.7}
        accessibilityLabel="Opciones de escucha"
        accessibilityRole="button"
        accessibilityHint="Notificaciones, temporizador, calidad y alarmas"
      >
        <Ionicons name="options-outline" size={20} color={Colors.textFaint} />
      </TouchableOpacity>
    </View>
  );
}
