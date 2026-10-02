import { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type {
  BibleBook,
  BibleMatchMode,
  BibleSearchResponse,
  BibleSearchResult,
} from '@radio/types';
import { Colors, Typography, Radii, Spacing } from '@/constants/theme';
import { BibleSearchVerseList } from './BibleSearchVerseList';

interface BibleSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (bookName: string, chapterNumber: number) => void;
  onSearch: (query: string, signal: AbortSignal) => Promise<BibleSearchResponse>;
}

type SearchStatus = 'loading' | 'done' | 'error';

/** The chapter branch returns plain verses, so the reference shape is rebuilt here. */
function chapterVersesAsResults(response: Extract<BibleSearchResponse, { type: 'chapter' }>): BibleSearchResult[] {
  return response.verses.map((verse) => ({
    ...verse,
    chapter: { number: response.chapter, book: { name: response.book.name } },
  }));
}

function hasResults(response: BibleSearchResponse): boolean {
  switch (response.type) {
    case 'book':
      return response.chapters.length > 0;
    case 'chapter':
      return response.verses.length > 0;
    case 'ambiguous':
    case 'reference':
    case 'fulltext':
      return response.results.length > 0;
  }
}

/** Shown when the AND pass found nothing and the query was widened to OR. */
function PartialMatchNotice() {
  return (
    <View style={styles.partialNotice}>
      <Text style={styles.partialNoticeText}>
        No se encontraron todos los términos, así que estos resultados pueden ser parciales.
      </Text>
    </View>
  );
}

/** Verse hits that travel with a book answer, hidden when there are none. */
function SupplementaryVerses({
  matchMode,
  results,
  highlightTerms,
  onSelect,
}: {
  matchMode: BibleMatchMode;
  results: BibleSearchResult[];
  highlightTerms?: string[];
  onSelect: (bookName: string, chapterNumber: number) => void;
}) {
  if (results.length === 0) return null;

  return (
    <View style={{ gap: Spacing.md }}>
      {matchMode === 'any' && <PartialMatchNotice />}
      <Text style={styles.supplementaryLabel}>
        La palabra también aparece en {results.length} versículo{results.length === 1 ? '' : 's'}
      </Text>
      <BibleSearchVerseList verses={results} highlightTerms={highlightTerms} onSelect={onSelect} />
    </View>
  );
}

function ChapterGrid({
  book,
  chapters,
  onPick,
}: {
  book: BibleBook;
  chapters: number[];
  onPick: (chapter: number) => void;
}) {
  return (
    <View>
      <View style={styles.bookHeader}>
        <View style={styles.bookIcon}>
          <Ionicons name="book-outline" size={20} color={Colors.accent} />
        </View>
        <View style={styles.bookHeaderText}>
          <Text style={styles.bookName}>{book.name}</Text>
          <Text style={styles.bookMeta}>
            {book.testament === 'NT' ? 'Nuevo Testamento' : 'Antiguo Testamento'} · {chapters.length} capitulos
          </Text>
        </View>
      </View>
      <View style={styles.chapterGrid}>
        {chapters.map((chapter) => (
          <TouchableOpacity
            key={chapter}
            style={styles.chapterButton}
            onPress={() => onPick(chapter)}
          >
            <Text style={styles.chapterLabel}>{chapter}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function SearchBody({
  response,
  highlightTerms,
  onSelect,
}: {
  response: BibleSearchResponse;
  highlightTerms?: string[];
  onSelect: (bookName: string, chapterNumber: number) => void;
}) {
  switch (response.type) {
    case 'book':
      return (
        <View style={{ gap: Spacing.lg }}>
          <ChapterGrid
            book={response.book}
            chapters={response.chapters}
            onPick={(chapter) => onSelect(response.book.name, chapter)}
          />
          <SupplementaryVerses
            matchMode={response.matchMode}
            results={response.results}
            highlightTerms={highlightTerms}
            onSelect={onSelect}
          />
        </View>
      );
    case 'ambiguous':
      return (
        <View style={{ gap: Spacing.lg }}>
          <View style={styles.ambiguousNotice}>
            <Text style={styles.partialNoticeText}>
              Esta palabra coincide con varios libros. Elige uno o revisa los versículos debajo.
            </Text>
          </View>
          {response.candidates.map((candidate) => (
            <ChapterGrid
              key={candidate.book.id}
              book={candidate.book}
              chapters={candidate.chapters}
              onPick={(chapter) => onSelect(candidate.book.name, chapter)}
            />
          ))}
          <SupplementaryVerses
            matchMode={response.matchMode}
            results={response.results}
            highlightTerms={highlightTerms}
            onSelect={onSelect}
          />
        </View>
      );
    case 'chapter':
      return <BibleSearchVerseList verses={chapterVersesAsResults(response)} onSelect={onSelect} />;
    case 'reference':
      return <BibleSearchVerseList verses={response.results} onSelect={onSelect} />;
    case 'fulltext':
      return (
        <View style={{ gap: Spacing.md }}>
          {response.matchMode === 'any' && <PartialMatchNotice />}
          <BibleSearchVerseList
            verses={response.results}
            highlightTerms={highlightTerms}
            onSelect={onSelect}
          />
        </View>
      );
  }
}

export function BibleSearch({ isOpen, onClose, onSelect, onSearch }: BibleSearchProps) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<BibleSearchResponse | null>(null);
  const [status, setStatus] = useState<SearchStatus>('done');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [contentKey, setContentKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const { height: windowHeight } = useWindowDimensions();

  // Only free-text results are highlighted: in a reference or chapter result
  // the query terms are book names and numbers, not words found in the verse.
  // Single characters are dropped so a leading numeral in "1 co" does not
  // highlight every digit in the text.
  const highlightTerms = useMemo(() => {
    if (response === null) return undefined;
    if (response.type !== 'fulltext' && response.type !== 'book' && response.type !== 'ambiguous') {
      return undefined;
    }
    return submittedQuery.split(/\s+/).filter((term) => term.length >= 2);
  }, [response, submittedQuery]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    // A slower previous query must not overwrite the result of this one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setErrorMessage(null);

    try {
      const data = await onSearch(trimmed, controller.signal);
      if (controller.signal.aborted) return;
      setResponse(data);
      setSubmittedQuery(trimmed);
      setStatus('done');
    } catch (err) {
      if (controller.signal.aborted) return;
      setResponse(null);
      setErrorMessage(err instanceof Error ? err.message : 'No se pudo completar la búsqueda.');
      setStatus('error');
    }
  };

  const handleClose = () => {
    onClose();
    abortRef.current?.abort();
    abortRef.current = null;
    setQuery('');
    setResponse(null);
    setErrorMessage(null);
  };

  const renderBody = () => {
    if (status === 'loading') {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.centerText}>Buscando en las escrituras...</Text>
        </View>
      );
    }

    if (status === 'error') {
      return (
        <View style={styles.centerBox}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.accent} />
          <Text style={styles.centerText}>{errorMessage}</Text>
        </View>
      );
    }

    if (response === null) {
      return (
        <View style={styles.centerBox}>
          <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.centerText}>
            Escribe un libro, una referencia o una palabra para empezar.
          </Text>
        </View>
      );
    }

    if (!hasResults(response)) {
      return (
        <View style={styles.centerBox}>
          <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.centerText}>
            No se encontraron resultados para "{submittedQuery}"
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.resultsContainer}>
        <SearchBody
          response={response}
          highlightTerms={highlightTerms}
          onSelect={(bookName, chapterNumber) => {
            onSelect(bookName, chapterNumber);
            handleClose();
          }}
        />
      </ScrollView>
    );
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={handleClose} onShow={() => setContentKey(prev => prev + 1)}>
      <View style={styles.overlay}>
        <View style={{ height: windowHeight * 0.1 }} pointerEvents="none" />
        <SafeAreaView style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color={Colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.input}
                placeholder="Buscar palabra o frase..."
                placeholderTextColor={Colors.textMuted}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoFocus
              />
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Results */}
          <View style={styles.content} key={contentKey}>
            {renderBody()}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    backgroundColor: '#0c0c1e',
    flex: 1,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    marginRight: Spacing.sm,
  },
  searchIcon: {
    marginRight: Spacing.xs,
  },
  input: {
    flex: 1,
    height: 40,
    color: Colors.text,
    ...Typography.body,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  content: {
    flex: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  centerText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  resultsContainer: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  bookHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  bookIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    backgroundColor: Colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookHeaderText: {
    flex: 1,
  },
  bookName: {
    ...Typography.body,
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  bookMeta: {
    ...Typography.body,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.textMuted,
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  chapterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chapterLabel: {
    ...Typography.body,
    fontSize: 15,
    color: Colors.text,
  },
  partialNotice: {
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accentGlow,
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  ambiguousNotice: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  supplementaryLabel: {
    ...Typography.body,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.textMuted,
  },
  partialNoticeText: {
    ...Typography.body,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textMuted,
  },
});