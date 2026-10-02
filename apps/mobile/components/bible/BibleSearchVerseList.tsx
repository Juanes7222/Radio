import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Typography } from '@/constants/theme';
import type { BibleSearchResult } from '@radio/types';

interface BibleSearchVerseListProps {
  verses: BibleSearchResult[];
  onSelect: (bookName: string, chapterNumber: number) => void;
}

export function BibleSearchVerseList({ verses, onSelect }: BibleSearchVerseListProps) {
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
          <Text style={styles.resultText}>{verse.text}</Text>
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
});