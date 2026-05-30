import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="book" size={24} color={Colors.accent} />
              <Text style={styles.headerTitle}>Santa Biblia</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Toolbar */}
          <View style={styles.toolbar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarScroll}>
              <TouchableOpacity style={styles.toolbarBtn} onPress={() => setIsNavOpen(true)}>
                <Text style={styles.toolbarBtnText}>{currentBook}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolbarBtn} onPress={() => setIsNavOpen(true)}>
                <Text style={styles.toolbarBtnText}>Capítulo {currentChapter}</Text>
              </TouchableOpacity>
              <View style={styles.toolbarBtn}>
                <Text style={styles.toolbarBtnText}>{currentTranslation}</Text>
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.searchBtn} onPress={() => setIsSearchOpen(true)}>
              <Ionicons name="search" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {isLoading ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={Colors.accent} />
                <Text style={styles.centerText}>Cargando la palabra de Dios...</Text>
              </View>
            ) : chapterData?.verses ? (
              <ScrollView contentContainerStyle={styles.versesContainer}>
                <Text style={styles.chapterTitle}>{currentBook} {currentChapter}</Text>
                {chapterData.verses.map((verse) => (
                  <View key={verse.id} style={styles.verseRow}>
                    <Text style={styles.verseNumber}>{verse.number}</Text>
                    <Text style={styles.verseText}>{verse.text}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.centerBox}>
                <Text style={styles.centerText}>No se encontró el capítulo seleccionado.</Text>
              </View>
            )}
          </View>

          {/* Bottom Nav */}
          <View style={styles.bottomNav}>
            <TouchableOpacity 
              style={[styles.navBtn, (isLoading || isFirstBookAndChapter) && styles.navBtnDisabled]}
              onPress={actions.prevChapter}
              disabled={isLoading || isFirstBookAndChapter}
            >
              <Ionicons name="chevron-back" size={20} color={isLoading || isFirstBookAndChapter ? Colors.textMuted : Colors.text} />
              <Text style={[styles.navBtnText, (isLoading || isFirstBookAndChapter) && styles.navBtnTextDisabled]}>Anterior</Text>
            </TouchableOpacity>
            
            <Text style={styles.navCurrentText}>{currentBook} {currentChapter}</Text>
            
            <TouchableOpacity 
              style={[styles.navBtn, (isLoading || isLastBookAndChapter) && styles.navBtnDisabled]}
              onPress={actions.nextChapter}
              disabled={isLoading || isLastBookAndChapter}
            >
              <Text style={[styles.navBtnText, (isLoading || isLastBookAndChapter) && styles.navBtnTextDisabled]}>Siguiente</Text>
              <Ionicons name="chevron-forward" size={20} color={isLoading || isLastBookAndChapter ? Colors.textMuted : Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Overlays */}
          <BibleChapterNavigator
            isOpen={isNavOpen}
            onClose={() => setIsNavOpen(false)}
            books={books}
            currentBook={currentBook}
            onSelect={(bookName, chapterNum) => {
              actions.setBook(bookName);
              actions.setChapter(chapterNum);
            }}
          />

          <BibleSearch
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            onSearch={actions.searchBible}
            onSelect={(bookName, chapterNum) => {
              actions.setBook(bookName);
              actions.setChapter(chapterNum);
            }}
          />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#0c0c1e', // match radio theme
    height: '92%',
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    ...Typography.screenTitle,
    color: Colors.text,
    fontSize: 20,
  },
  iconBtn: {
    padding: Spacing.xs,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  toolbarScroll: {
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  toolbarBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  toolbarBtnText: {
    ...Typography.body,
    fontSize: 13,
    color: Colors.text,
  },
  searchBtn: {
    padding: Spacing.md,
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
  versesContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl * 2,
  },
  chapterTitle: {
    ...Typography.screenTitle,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  verseRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  verseNumber: {
    ...Typography.body,
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.accent,
    marginRight: Spacing.sm,
    marginTop: 3,
    width: 20,
  },
  verseText: {
    ...Typography.body,
    fontSize: 16,
    color: Colors.text,
    lineHeight: 24,
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: '#0c0c1e',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.sm,
    gap: Spacing.xs,
  },
  navBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.05)',
  },
  navBtnText: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.text,
  },
  navBtnTextDisabled: {
    color: Colors.textMuted,
  },
  navCurrentText: {
    ...Typography.body,
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.text,
  },
});