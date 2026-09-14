import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface ScreenHeaderProps {
  /** Small uppercase label above the title. */
  eyebrow: string;
  title: string;
  subtitle?: string;
}

/**
 * Shared screen header for secondary tabs: eyebrow + Fraunces display title.
 * Keeps heading typography consistent across screens that scroll freely.
 */
export function ScreenHeader({ eyebrow, title, subtitle }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  eyebrow: {
    ...Typography.eyebrow,
    color: Colors.signal,
  },
  title: {
    ...Typography.display,
    color: Colors.text,
    marginTop: 2,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
