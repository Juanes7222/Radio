import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { splitBibleText } from '@radio/api';
import { Colors, Typography } from '@/constants/theme';
import type { BibleSearchResult } from '@radio/types';

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
        <TouchableOpacity
          key={verse.id}
          style={styles.resultCard}
          onPress={() => onSelect(verse.chapter.book.name, verse.chapter.number)}
        >
          <Text style={styles.resultReference}>
            {verse.chapter.book.name} {verse.chapter.number}:{verse.number}
          </Text>
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
        </TouchableOpacity>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
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