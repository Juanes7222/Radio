import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
} from 'react-native-reanimated';
import { useBible } from '@/hooks/useBible';
import { BibleChapterNavigator } from './BibleChapterNavigator';
import { BibleSearch } from './BibleSearch';
import { Colors, Typography, Radii, Spacing } from '@/constants/theme';
import { Durations, Easings, Motion } from '@/constants/motion';
import { PressScale } from '@/components/ui/PressScale';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
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
      <View style={styles.container}>
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
            <PressScale
              style={styles.fontSizeBtn}
              disabled={fontSize <= FONT_SIZE_MIN}
              onPress={() => setFontSize((s) => Math.max(FONT_SIZE_MIN, s - FONT_SIZE_STEP))}
              accessibilityLabel="Reducir tamaño de texto"
            >
              <Text style={[styles.fontSizeBtnText, fontSize <= FONT_SIZE_MIN && styles.fontSizeBtnDisabled]}>A-</Text>
            </PressScale>
            <PressScale
              style={styles.fontSizeBtn}
              disabled={fontSize >= FONT_SIZE_MAX}
              onPress={() => setFontSize((s) => Math.min(FONT_SIZE_MAX, s + FONT_SIZE_STEP))}
              accessibilityLabel="Aumentar tamaño de texto"
            >
              <Text style={[styles.fontSizeBtnText, fontSize >= FONT_SIZE_MAX && styles.fontSizeBtnDisabled]}>A+</Text>
            </PressScale>
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
            <BottomSheetScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.versesContainer}
              showsVerticalScrollIndicator={false}
              scrollEnabled={true}
            >
              {/* A chapter turn is a page turn, not a response to a tap: the
                  slowest, softest entrance in the app. Keyed on the chapter so
                  it replays on every turn, and scoped to the reading area so
                  the header keeps its own state. */}
              <Animated.View
                key={`chapter-${currentBook}-${currentChapter}`}
                entering={FadeInDown.duration(Durations.slow).easing(Easing.bezier(...Easings.enter))}
                exiting={FadeIn.duration(Durations.fast)}
              >
                <Text style={styles.chapterTitle}>{currentBook}</Text>
                <Animated.Text
                  entering={FadeIn.delay(Motion.entryStaggerMs * 2).duration(Durations.slow).easing(Easing.bezier(...Easings.enter))}
                  style={styles.chapterSubtitle}
                >
                  Capítulo {currentChapter}
                </Animated.Text>
              </Animated.View>

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
                          <Animated.View
                            entering={ZoomIn.duration(Durations.normal).easing(Easing.bezier(...Easings.spring))}
                            exiting={FadeIn.duration(Durations.instant)}
                          >
                            <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                          </Animated.View>
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
            </BottomSheetScrollView>
          ) : (
            <View style={styles.centerBox}>
              <Text style={styles.centerText}>No se encontró el capítulo.</Text>
            </View>
          )}
        </View>

        {/* Navegación Flotante (Glassmorphism) */}
        <BlurView intensity={80} tint="dark" style={styles.floatingNavContainer}>
          <View style={styles.bottomNav}>
            <PressScale
              style={[styles.navBtn, (isLoading || isFirstBookAndChapter) && styles.navBtnDisabled]}
              disabled={isLoading || isFirstBookAndChapter}
              onPress={handlePrevChapter}
              accessibilityLabel="Capítulo anterior"
            >
              <Ionicons name="arrow-back" size={18} color={isLoading || isFirstBookAndChapter ? Colors.textMuted : Colors.text} />
            </PressScale>

            <View style={styles.translationBadge}>
              <Text style={styles.translationText}>{currentTranslation}</Text>
            </View>

            <PressScale
              style={[styles.navBtn, (isLoading || isLastBookAndChapter) && styles.navBtnDisabled]}
              disabled={isLoading || isLastBookAndChapter}
              onPress={handleNextChapter}
              accessibilityLabel="Capítulo siguiente"
            >
              <Ionicons name="arrow-forward" size={18} color={isLoading || isLastBookAndChapter ? Colors.textMuted : Colors.text} />
            </PressScale>
          </View>
        </BlurView>

        <BibleChapterNavigator isOpen={isNavOpen} onClose={() => setIsNavOpen(false)} books={books} currentBook={currentBook} onSelect={(bookName, chapterNum) => { actions.setBook(bookName); actions.setChapter(chapterNum); }} />
        <BibleSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onSearch={actions.searchBible} onSelect={(bookName, chapterNum) => { actions.setBook(bookName); actions.setChapter(chapterNum); }} />
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
    // These are the primary legibility control of a reading surface; at 4dp of
    // vertical padding they were ~28dp tall, well under a reliable touch.
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
