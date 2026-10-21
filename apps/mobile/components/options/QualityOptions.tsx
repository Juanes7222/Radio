import { StyleSheet, Text, View } from 'react-native';
import { PressScale } from '@/components/ui/PressScale';
import { Ionicons } from '@expo/vector-icons';
import type { StreamQuality } from '@radio/types';
import { Colors, Typography } from '@/constants/theme';
import { tick } from '@/lib/haptics';

// Letras para el oyente en lugar de kbps de ingeniero: la palabra va delante y
// el valor queda entre paréntesis cuando aporta información.
const QUALITY_LABELS: Record<StreamQuality, string> = {
  '64': 'Baja (ahorra datos)',
  '128': 'Media',
  '320': 'Alta',
};

interface QualityOptionsProps {
  currentQuality: StreamQuality | null;
  availableQualities: StreamQuality[];
  onSelect: (quality: StreamQuality) => void;
}

export function QualityOptions({ currentQuality, availableQualities, onSelect }: QualityOptionsProps) {
  return (
    <View style={styles.options}>
      {availableQualities.map((quality) => {
        const isActive = quality === currentQuality;
        return (
          <PressScale
            key={quality}
            style={[styles.option, isActive && styles.optionActive]}
            accessibilityLabel={QUALITY_LABELS[quality]}
            onPress={() => {
              tick();
              onSelect(quality);
            }}
          >
            <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
              {QUALITY_LABELS[quality]}
            </Text>
            {isActive && <Ionicons name="checkmark" size={18} color={Colors.signal} />}
          </PressScale>
        );
      })}
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
  optionActive: {
    backgroundColor: Colors.signalMuted,
    borderColor: Colors.signalGlow,
  },
  optionText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 15,
  },
  optionTextActive: { color: Colors.signal, fontWeight: '700' as const },
});
