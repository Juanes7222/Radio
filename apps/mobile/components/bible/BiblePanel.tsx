import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useBible } from '@/hooks/useBible';
import { BibleChapterNavigator } from './BibleChapterNavigator';
import { BibleSearch } from './BibleSearch';
import { Colors, Typography, Radii, Spacing } from '@/constants/theme';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import type { BibleVerse } from '@radio/types';

const FONT_SIZE_MIN = 14;
const FONT_SIZE_MAX = 22;
const FONT_SIZE_STEP = 2;
const BASE_FONT_SIZE = 18;

interface BiblePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BiblePanel({ isOpen, onClose }: BiblePanelProps) {
  const { chapterData, isLoading, currentBook, currentChapter, currentTranslation, actions, books } = useBible();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [contentKey, setContentKey] = useState(0);
  const [fontSize, setFontSize] = useState(BASE_FONT_SIZE);
  const [copiedVerse, setCopiedVerse] = useState<number | null>(null);

  const isFirstBookAndChapter = currentBook === books[0]?.name && currentChapter === 1;
  const isLastBookAndChapter = currentBook === books[books.length - 1]?.name && currentChapter === (books[books.length - 1]?._count?.chapters || 1);

  const handleNextChapter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    actions.nextChapter();
  };

  const handlePrevChapter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    actions.prevChapter();
  };

  const handleCopyVerse = (verse: BibleVerse) => {
    Clipboard.setStringAsync(
      `${currentBook} ${currentChapter}:${verse.number} — ${verse.text}`,
    ).catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopiedVerse(verse.number);
    setTimeout(() => {
      setCopiedVerse(null);
    }, 1500);
  };

  return (
    <AppBottomSheet visible={isOpen} onClose={onClose} snapPoints={['92%', '96%']}>
      <View style={styles.container} key={contentKey}>
        {/* Header Minimalista */}
        <View style={styles.header}>
          <View style={styles.headerPill}>
            <TouchableOpacity style={styles.selectorBtn} onPress={() => setIsNavOpen(true)}>
              <Text style={styles.selectorBookText}>{currentBook}</Text>
              <Text style={styles.selectorChapterText}>{currentChapter}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.fontSizeBtn}
              onPress={() => setFontSize((s) => Math.max(FONT_SIZE_MIN, s - FONT_SIZE_STEP))}
              disabled={fontSize <= FONT_SIZE_MIN}
            >
              <Text style={[styles.fontSizeBtnText, fontSize <= FONT_SIZE_MIN && styles.fontSizeBtnDisabled]}>A-</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fontSizeBtn}
              onPress={() => setFontSize((s) => Math.min(FONT_SIZE_MAX, s + FONT_SIZE_STEP))}
              disabled={fontSize >= FONT_SIZE_MAX}
            >
              <Text style={[styles.fontSizeBtnText, fontSize >= FONT_SIZE_MAX && styles.fontSizeBtnDisabled]}>A+</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setIsSearchOpen(true)}>
              <Ionicons name="search" size={20} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Área de Lectura */}
        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={Colors.signal} />
              <Text style={styles.centerText}>Cargando capítulo...</Text>
            </View>
          ) : chapterData?.verses ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.versesContainer}
              showsVerticalScrollIndicator={false}
              scrollEnabled={true}
            >
              <Text style={styles.chapterTitle}>{currentBook}</Text>
              <Text style={styles.chapterSubtitle}>Capítulo {currentChapter}</Text>
              
              <View style={styles.readingArea}>
                {chapterData.verses.map((verse) => {
                  const isCopied = copiedVerse === verse.number;
                  return (
                    <TouchableOpacity
                      key={verse.id}
                      style={styles.verseRow}
                      activeOpacity={0.6}
                      onPress={() => handleCopyVerse(verse)}
                    >
                      <View style={styles.verseNumberColumn}>
                        <Text style={styles.verseNumber}>{verse.number}</Text>
                        {isCopied && (
                          <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                        )}
                      </View>
                      <Text
                        style={[styles.verseText, { fontSize }, isCopied && styles.verseTextCopied]}
                      >
                        {verse.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <View style={styles.centerBox}>
              <Text style={styles.centerText}>No se encontró el capítulo.</Text>
            </View>
          )}
        </View>

        {/* Navegación Flotante (Glassmorphism) */}
        <BlurView intensity={80} tint="dark" style={styles.floatingNavContainer}>
          <View style={styles.bottomNav}>
            <TouchableOpacity 
              style={[styles.navBtn, (isLoading || isFirstBookAndChapter) && styles.navBtnDisabled]}
              onPress={handlePrevChapter}
              disabled={isLoading || isFirstBookAndChapter}
            >
              <Ionicons name="arrow-back" size={18} color={isLoading || isFirstBookAndChapter ? Colors.textMuted : Colors.text} />
            </TouchableOpacity>
            
            <View style={styles.translationBadge}>
              <Text style={styles.translationText}>{currentTranslation}</Text>
            </View>
            
            <TouchableOpacity 
              style={[styles.navBtn, (isLoading || isLastBookAndChapter) && styles.navBtnDisabled]}
              onPress={handleNextChapter}
              disabled={isLoading || isLastBookAndChapter}
            >
              <Ionicons name="arrow-forward" size={18} color={isLoading || isLastBookAndChapter ? Colors.textMuted : Colors.text} />
            </TouchableOpacity>
          </View>
        </BlurView>

        <BibleChapterNavigator isOpen={isNavOpen} onClose={() => setIsNavOpen(false)} books={books} currentBook={currentBook} onSelect={(bookName, chapterNum) => { actions.setBook(bookName); actions.setChapter(chapterNum); setContentKey(prev => prev + 1); }} />
        <BibleSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onSearch={actions.searchBible} onSelect={(bookName, chapterNum) => { actions.setBook(bookName); actions.setChapter(chapterNum); setContentKey(prev => prev + 1); }} />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderGlass,
    marginHorizontal: -4,
  },
  headerPill: {
    backgroundColor: Colors.surfaceGlass,
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  selectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  selectorBookText: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  selectorChapterText: {
    ...Typography.body,
    color: Colors.signal,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'center',
  },
  fontSizeBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  fontSizeBtnText: {
    ...Typography.body,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  fontSizeBtnDisabled: {
    opacity: 0.3,
  },
  iconBtn: {
    padding: Spacing.xs + 2,
    backgroundColor: Colors.surfaceGlass,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  content: {
    flex: 1,
    minHeight: 420,
  },
  versesContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: 120, 
  },
  chapterTitle: {
    ...Typography.screenTitle,
    fontSize: 26,
    color: Colors.text,
    textAlign: 'center',
    fontFamily: Typography.display.fontFamily,
  },
  chapterSubtitle: {
    ...Typography.body,
    fontSize: 13,
    color: Colors.signal,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: '700' as const,
  },
  readingArea: {
    gap: Spacing.md,
  },
  verseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  verseNumberColumn: {
    alignItems: 'center',
    width: 22,
    marginRight: Spacing.md,
    marginTop: 4,
    gap: 2,
  },
  verseNumber: {
    ...Typography.body,
    fontSize: 11,
    fontWeight: '800',
    color: Colors.signal,
    opacity: 0.9,
  },
  verseText: {
    ...Typography.body,
    color: 'rgba(255, 255, 255, 0.92)',
    lineHeight: 26,
    flex: 1,
  },
  verseTextCopied: {
    color: Colors.success,
  },
  floatingNavContainer: {
    position: 'absolute',
    bottom: Spacing.md,
    alignSelf: 'center',
    borderRadius: Radii.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    width: 200,
    backgroundColor: 'rgba(8,10,30,0.55)',
  },
  navBtn: {
    padding: Spacing.sm,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceGlass,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  translationBadge: {
    paddingHorizontal: Spacing.md,
  },
  translationText: {
    ...Typography.body,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  centerText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
});
