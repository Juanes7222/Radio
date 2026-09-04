import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { StreamQuality } from '@radio/types';
import { Colors, Typography } from '@/constants/theme';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';

const QUALITY_LABELS: Record<StreamQuality, string> = {
  '64': '64 kbps',
  '128': '128 kbps',
  '320': '320 kbps',
};

interface QualityModalProps {
  visible: boolean;
  currentQuality: StreamQuality;
  availableQualities: StreamQuality[];
  onClose: () => void;
  onSelect: (quality: StreamQuality) => void;
}

export function QualityModal({
  visible,
  currentQuality,
  availableQualities,
  onClose,
  onSelect,
}: QualityModalProps) {
  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['36%', '44%']}>
      <Text style={styles.title}>Calidad</Text>
      <Text style={styles.subtitle}>Elige el balance datos / fidelidad</Text>
      <View style={styles.options}>
        {availableQualities.map((quality) => {
          const isActive = quality === currentQuality;
          return (
            <TouchableOpacity
              key={quality}
              style={[styles.option, isActive && styles.optionActive]}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onSelect(quality);
              }}
            >
              <Text style={[styles.optionText, isActive && styles.optionTextActive]}>{QUALITY_LABELS[quality]}</Text>
              {isActive && <Ionicons name="checkmark" size={18} color={Colors.signal} />}
            </TouchableOpacity>
          );
        })}
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
  optionActive: {
    backgroundColor: Colors.signalMuted,
    borderColor: 'rgba(255,181,71,0.22)',
  },
  optionText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 15,
  },
  optionTextActive: { color: Colors.signal, fontWeight: '700' as const },
});
