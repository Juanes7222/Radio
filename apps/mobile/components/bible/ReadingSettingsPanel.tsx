import { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { PressScale } from '@/components/ui/PressScale';
import { tick } from '@/lib/haptics';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';

type ReadingTheme = 'night' | 'sepia' | 'high-contrast';

interface ReadingSettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onThemeChange: (theme: ReadingTheme) => void;
  theme: ReadingTheme;
}

const FONT_SIZE_MIN = 14;
const FONT_SIZE_MAX = 26;
const FONT_SIZE_STEP = 2;

const THEMES: Array<{ id: ReadingTheme; label: string; dot: string }> = [
  { id: 'night', label: 'Noche', dot: Colors.surfaceSoft },
  { id: 'sepia', label: 'Sepia', dot: '#7A5C33' },
  { id: 'high-contrast', label: 'Alto contraste', dot: Colors.text },
];

export function ReadingSettingsPanel({
  visible,
  onClose,
  fontSize,
  onFontSizeChange,
  onThemeChange,
  theme,
}: ReadingSettingsPanelProps) {
  const decrease = useCallback(() => {
    tick();
    onFontSizeChange(Math.max(FONT_SIZE_MIN, fontSize - FONT_SIZE_STEP));
  }, [fontSize, onFontSizeChange]);

  const increase = useCallback(() => {
    tick();
    onFontSizeChange(Math.min(FONT_SIZE_MAX, fontSize + FONT_SIZE_STEP));
  }, [fontSize, onFontSizeChange]);

  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['55%', '80%']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Lectura</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Tamaño de fuente */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tamaño de texto</Text>
          <View style={styles.row}>
            <PressScale
              style={styles.sizeBtn}
              disabled={fontSize <= FONT_SIZE_MIN}
              onPress={decrease}
              accessibilityLabel="Reducir tamaño de texto"
            >
              <Text style={styles.sizeBtnText}>A-</Text>
            </PressScale>
            <Text style={styles.sizeValue}>{fontSize} pt</Text>
            <PressScale
              style={styles.sizeBtn}
              disabled={fontSize >= FONT_SIZE_MAX}
              onPress={increase}
              accessibilityLabel="Aumentar tamaño de texto"
            >
              <Text style={styles.sizeBtnText}>A+</Text>
            </PressScale>
          </View>
        </View>

        {/* Tema de lectura */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tema de lectura</Text>
          <View style={styles.themeRow}>
            {THEMES.map((t) => (
              <PressScale
                key={t.id}
                style={[styles.themeBtn, theme === t.id && styles.themeBtnActive]}
                onPress={() => {
                  tick();
                  onThemeChange(t.id);
                }}
                accessibilityLabel={t.label}
                accessibilityState={{ selected: theme === t.id }}
              >
                <View style={[styles.themeDot, { backgroundColor: t.dot }]} />
                <Text style={[styles.themeLabel, theme === t.id && styles.themeLabelActive]}>
                  {t.label}
                </Text>
              </PressScale>
            ))}
          </View>
        </View>

        <View style={styles.spacer} />
      </View>
    </AppBottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.inkElevated,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderGlass,
  },
  title: {
    ...Typography.bodyStrong,
    color: Colors.text,
    fontSize: 18,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  section: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.sectionTitle,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  sizeBtn: {
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: Radii.full,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtnText: {
    ...Typography.bodyStrong,
    color: Colors.text,
    fontSize: 14,
  },
  sizeValue: {
    ...Typography.body,
    color: Colors.textMuted,
    fontSize: 14,
  },
  themeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  themeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minHeight: 40,
  },
  themeBtnActive: {
    borderColor: Colors.signal,
    backgroundColor: Colors.signalMuted,
  },
  themeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  themeLabel: {
    ...Typography.body,
    color: Colors.textMuted,
    fontSize: 13,
  },
  themeLabelActive: {
    color: Colors.signal,
    fontWeight: '700' as const,
  },
  spacer: {
    paddingBottom: Spacing.xl,
  },
});
