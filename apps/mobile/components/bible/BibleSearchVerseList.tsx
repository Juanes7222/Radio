import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { splitBibleText } from '@radio/api';
import { Colors, Typography } from '@/constants/theme';
import { Durations, Spring } from '@/constants/motion';
import type { BibleSearchResult } from '@radio/types';

const AnimatedPressable = Animated.createAnimatedComponent(TouchableOpacity);

interface BibleSearchVerseListProps {
  verses: BibleSearchResult[];
  /** Terms to emphasize; omitted for reference and chapter results. */
  highlightTerms?: string[];
  onSelect: (bookName: string, chapterNumber: number) => void;
}

export function BibleSearchVerseList({ verses, highlightTerms, onSelect }: BibleSearchVerseListProps) {
  return (
    <>
      {verses.map((verse) => (
        <ResultCard
          key={verse.id}
          verse={verse}
          highlightTerms={highlightTerms}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function ResultCard({
  verse,
  highlightTerms,
  onSelect,
}: {
  verse: BibleSearchResult;
  highlightTerms?: string[];
  onSelect: (bookName: string, chapterNumber: number) => void;
}) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.015 }],
    opacity: 1 - pressed.value * 0.05,
  }));

  const reference = `${verse.chapter.book.name} ${verse.chapter.number}:${verse.number}`;

  return (
    <AnimatedPressable
      onPress={() => onSelect(verse.chapter.book.name, verse.chapter.number)}
      style={[styles.resultCard, animated]}
      accessibilityRole="button"
      accessibilityLabel={`${reference}. ${verse.text}`}
      onPressIn={() => { pressed.value = withTiming(1, { duration: Durations.instant }); }}
      onPressOut={() => { pressed.value = withSpring(0, Spring.snappy); }}
    >
      <Text style={styles.resultReference}>{reference}</Text>
      <Text style={styles.resultText}>
        {highlightTerms
          ? splitBibleText(verse.text, highlightTerms).map((segment, index) =>
              segment.matched ? (
                <Text key={index} style={styles.matchHighlight}>
                  {segment.text}
                </Text>
              ) : (
                <Text key={index}>{segment.text}</Text>
              ),
            )
          : verse.text}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    minHeight: 44,
  },
  resultReference: {
    ...Typography.body,
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  resultText: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
  },
  matchHighlight: {
    backgroundColor: Colors.accentMuted,
    color: Colors.text,
    fontWeight: 'bold',
  },
});