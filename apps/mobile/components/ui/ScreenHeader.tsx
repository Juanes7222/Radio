import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

/**
 * Shared screen header for secondary tabs: Fraunces display title and subtitle.
 * Keeps heading typography consistent across screens that scroll freely.
 * There is no kicker above the title: the heading carries its own weight.
 */
export function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
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
