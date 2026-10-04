import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
} from 'react-native-reanimated';
import type { BibleBook } from '@radio/types';
import { Colors, Typography, Radii, Spacing } from '@/constants/theme';
import { Durations, Easings } from '@/constants/motion';
import { PressScale } from '@/components/ui/PressScale';

const AnimatedTabButton = Animated.createAnimatedComponent(TouchableOpacity);

interface BibleChapterNavigatorProps {
  isOpen: boolean;
  onClose: () => void;
  books: BibleBook[];
  currentBook: string;
  onSelect: (bookName: string, chapterNumber: number) => void;
}

export function BibleChapterNavigator({ isOpen, onClose, books, currentBook, onSelect }: BibleChapterNavigatorProps) {
  const [activeTab, setActiveTab] = useState<'AT' | 'NT'>('AT');
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const { height: windowHeight } = useWindowDimensions();

  const atBooks = books.filter(b => b.testament === 'AT');
  const ntBooks = books.filter(b => b.testament === 'NT');
  const displayBooks = activeTab === 'AT' ? atBooks : ntBooks;

  const currentBookObj = books.find(b => b.name === (selectedBook || currentBook));
  const chapterCount = currentBookObj?._count?.chapters || 1;

  // Si cambiamos de pestaña, limpiamos el libro seleccionado
  const handleTabChange = (tab: 'AT' | 'NT') => {
    setActiveTab(tab);
    setSelectedBook(null);
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={{ height: windowHeight * 0.15 }} pointerEvents="none" />
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              {selectedBook ? (
                <PressScale onPress={() => setSelectedBook(null)} style={styles.backBtn} accessibilityLabel={`Volver a la lista de libros desde ${selectedBook}`}>
                  <Ionicons name="arrow-back-outline" size={24} color={Colors.text} />
                  <Text style={styles.headerTitle}>{selectedBook}</Text>
                </PressScale>
              ) : (
                <Text style={styles.headerTitle}>Seleccionar Libro</Text>
              )}
            </View>
            <PressScale onPress={onClose} style={styles.closeBtn} accessibilityLabel="Cerrar el selector de capítulos">
              <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
            </PressScale>
          </View>

          <View style={styles.content}>
          {!selectedBook ? (
            <>
              {/* Modern Segmented Control */}
              <View style={styles.segmentedControl}>
                {(['AT', 'NT'] as const).map((tab) => {
                  const label = tab === 'AT' ? 'Antiguo Testamento' : 'Nuevo Testamento';
                  const isActive = activeTab === tab;
                  return (
                    <AnimatedTabButton
                      key={tab}
                      onPress={() => handleTabChange(tab)}
                      style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}
                      accessibilityRole="tab"
                      accessibilityLabel={label}
                      accessibilityState={{ selected: isActive }}
                    >
                      <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                        {label}
                      </Text>
                    </AnimatedTabButton>
                  );
                })}
              </View>

              {/* The testament lists swap in place, so a cross-fade is the honest
                  transition: the same slot is being refilled, not navigated. */}
              <Animated.View
                key={`testament-${activeTab}`}
                entering={FadeIn.duration(Durations.fast).easing(Easing.bezier(...Easings.enter))}
                exiting={FadeOut.duration(Durations.instant)}
                style={{ flex: 1 }}
              >
                <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.gridContainer} showsVerticalScrollIndicator={false}>
                  <View style={styles.grid}>
                    {displayBooks.map(b => (
                      <PressScale
                        key={b.id}
                        style={[styles.bookPill, currentBook === b.name && styles.bookPillCurrent]}
                        onPress={() => setSelectedBook(b.name)}
                        accessibilityLabel={`Ver capítulos de ${b.name}`}
                        accessibilityState={{ selected: currentBook === b.name }}
                      >
                        <Text style={[styles.bookPillText, currentBook === b.name && styles.bookPillTextCurrent]} numberOfLines={1}>
                          {b.name}
                        </Text>
                      </PressScale>
                    ))}
                  </View>
                </ScrollView>
              </Animated.View>
            </>
          ) : (
            /* Drilling from a book into its chapters moves one level deeper, so
               it carries the app's "rising" direction: the book list lifts away
               and the grid rises into place. */
            <Animated.View
              entering={FadeInDown.duration(Durations.normal).easing(Easing.bezier(...Easings.enter))}
              exiting={FadeOutUp.duration(Durations.fast).easing(Easing.bezier(...Easings.exit))}
              style={{ flex: 1 }}
            >
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.gridContainer}>
                <Text style={styles.instruction}>Selecciona un capítulo</Text>
                <View style={styles.gridChapters}>
                  {Array.from({ length: chapterCount }).map((_, i) => {
                    const num = i + 1;
                    return (
                      <PressScale
                        key={num}
                        style={styles.chapterBtn}
                        onPress={() => {
                          onSelect(selectedBook, num);
                          onClose();
                          setSelectedBook(null);
                        }}
                        accessibilityLabel={`Capítulo ${num} de ${selectedBook}`}
                      >
                        <Text style={styles.chapterBtnText}>{num}</Text>
                      </PressScale>
                    );
                  })}
                </View>
              </ScrollView>
            </Animated.View>
          )}
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
    backgroundColor: Colors.inkSoft,
    flex: 1,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderTopWidth: 1,
    borderColor: Colors.borderGlass,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: {
    ...Typography.screenTitle,
    color: Colors.text,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  closeBtn: {
    padding: Spacing.xs,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  gridContainer: {
    padding: Spacing.md,
  },
  instruction: {
    ...Typography.body,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    margin: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radii.lg,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radii.md,
  },
  segmentBtnActive: {
    backgroundColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  segmentText: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'space-between',
  },
  bookPill: {
    width: '48%',
    backgroundColor: Colors.surfaceDim,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 44,
    justifyContent: 'center',
  },
  bookPillCurrent: {
    backgroundColor: Colors.signalFaint,
    borderColor: Colors.signalGlow,
  },
  bookPillText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 15,
    textAlign: 'center',
  },
  bookPillTextCurrent: {
    color: Colors.accent,
    fontWeight: 'bold',
  },
  gridChapters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md, // Más espacio para respirar
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  chapterBtn: {
    width: 64, // Botones más grandes
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
  },
  chapterBtnText: {
    ...Typography.screenTitle,
    fontSize: 20,
    color: Colors.text,
  },
});