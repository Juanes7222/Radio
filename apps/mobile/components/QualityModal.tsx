import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { StreamQuality } from '@radio/types';
import { Colors, Radii, Typography } from '@/constants/theme';

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

          <Text style={styles.title}>Calidad del stream</Text>

          {availableQualities.map((quality) => (
            <TouchableOpacity
              key={quality}
              style={styles.option}
              activeOpacity={0.7}
              onPress={() => onSelect(quality)}
            >
              <Text style={styles.optionText}>{QUALITY_LABELS[quality]}</Text>
              {quality === currentQuality && (
                <Ionicons name="checkmark" size={18} color={Colors.accent} />
              )}
            </TouchableOpacity>
          ))}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  optionText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 16,
  },
});
