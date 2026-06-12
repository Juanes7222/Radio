import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, SafeAreaView, ActivityIndicator } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons'; // Considera cambiar a lucide-react-native
import { useBible } from '@/hooks/useBible';
import { BibleChapterNavigator } from './BibleChapterNavigator';
import { BibleSearch } from './BibleSearch';
import { Colors, Typography, Radii, Spacing } from '@/constants/theme';

interface BiblePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BiblePanel({ isOpen, onClose }: BiblePanelProps) {
  const { chapterData, isLoading, currentBook, currentChapter, currentTranslation, actions, books } = useBible();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const isFirstBookAndChapter = currentBook === books[0]?.name && currentChapter === 1;
  const isLastBookAndChapter = currentBook === books[books.length - 1]?.name && currentChapter === (books[books.length - 1]?._count?.chapters || 1);

  const handleNextChapter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    actions.nextChapter();
  };

  const handlePrevChapter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    actions.prevChapter();
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container}>
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
              <TouchableOpacity style={styles.iconBtn} onPress={() => setIsSearchOpen(true)}>
                <Ionicons name="search" size={22} color={Colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Área de Lectura */}
          <View style={styles.content}>
            {isLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={Colors.accent} />
                <Text style={styles.centerText}>Cargando capítulo...</Text>
              </View>
            ) : chapterData?.verses ? (
              <ScrollView 
                contentContainerStyle={styles.versesContainer}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.chapterTitle}>{currentBook}</Text>
                <Text style={styles.chapterSubtitle}>Capítulo {currentChapter}</Text>
                
                <View style={styles.readingArea}>
                  {chapterData.verses.map((verse) => (
                    <View key={verse.id} style={styles.verseRow}>
                      <Text style={styles.verseNumber}>{verse.number}</Text>
                      <Text style={styles.verseText}>{verse.text}</Text>
                    </View>
                  ))}
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
                <Ionicons name="arrow-back" size={20} color={isLoading || isFirstBookAndChapter ? Colors.textMuted : Colors.text} />
              </TouchableOpacity>
              
              <View style={styles.translationBadge}>
                <Text style={styles.translationText}>{currentTranslation}</Text>
              </View>
              
              <TouchableOpacity 
                style={[styles.navBtn, (isLoading || isLastBookAndChapter) && styles.navBtnDisabled]}
                onPress={handleNextChapter}
                disabled={isLoading || isLastBookAndChapter}
              >
                <Ionicons name="arrow-forward" size={20} color={isLoading || isLastBookAndChapter ? Colors.textMuted : Colors.text} />
              </TouchableOpacity>
            </View>
          </BlurView>

          <BibleChapterNavigator isOpen={isNavOpen} onClose={() => setIsNavOpen(false)} books={books} currentBook={currentBook} onSelect={(bookName, chapterNum) => { actions.setBook(bookName); actions.setChapter(chapterNum); }} />
          <BibleSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onSearch={actions.searchBible} onSelect={(bookName, chapterNum) => { actions.setBook(bookName); actions.setChapter(chapterNum); }} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#0c0c1e',
    height: '95%', // Ligeramente más alto para dar sensación de inmersión
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  headerPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radii.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
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
    color: Colors.accent,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  iconBtn: {
    padding: Spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radii.full,
  },
  content: {
    flex: 1,
  },
  versesContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: 120, // Espacio para la barra flotante
  },
  chapterTitle: {
    ...Typography.screenTitle,
    fontSize: 28,
    color: Colors.text,
    textAlign: 'center',
  },
  chapterSubtitle: {
    ...Typography.body,
    fontSize: 16,
    color: Colors.accent,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  readingArea: {
    gap: Spacing.md,
  },
  verseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start', // Alinea el número arriba con la primera línea
  },
  verseNumber: {
    ...Typography.body,
    fontSize: 11,
    fontWeight: '800',
    color: Colors.accent,
    marginRight: Spacing.md,
    marginTop: 4, // Ajuste óptico con el texto
    width: 22,
    opacity: 0.8,
  },
  verseText: {
    ...Typography.body,
    fontSize: 18, // Texto más grande para lectura
    color: 'rgba(255, 255, 255, 0.9)', // Blanco ligeramente suavizado
    lineHeight: 28, // Altura de línea amplia
    flex: 1,
  },
  floatingNavContainer: {
    position: 'absolute',
    bottom: Spacing.xl,
    alignSelf: 'center',
    borderRadius: Radii.full,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    width: 200,
    backgroundColor: 'rgba(12, 12, 30, 0.5)',
  },
  navBtn: {
    padding: Spacing.sm,
    borderRadius: Radii.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  translationBadge: {
    paddingHorizontal: Spacing.md,
  },
  translationText: {
    ...Typography.body,
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
});