import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, SafeAreaView, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BibleBook } from '@radio/types';
import { Colors, Typography, Radii, Spacing } from '@/constants/theme';

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
  const [contentKey, setContentKey] = useState(0);
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
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose} onShow={() => setContentKey(prev => prev + 1)}>
      <View style={styles.overlay}>
        <View style={{ height: windowHeight * 0.15 }} pointerEvents="none" />
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              {selectedBook ? (
                <TouchableOpacity onPress={() => setSelectedBook(null)} style={styles.backBtn}>
                  <Ionicons name="arrow-back-outline" size={24} color={Colors.text} />
                  <Text style={styles.headerTitle}>{selectedBook}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.headerTitle}>Seleccionar Libro</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.content} key={contentKey}>
          {!selectedBook ? (
            <>
              {/* Modern Segmented Control */}
              <View style={styles.segmentedControl}>
                <TouchableOpacity
                  style={[styles.segmentBtn, activeTab === 'AT' && styles.segmentBtnActive]}
                  onPress={() => handleTabChange('AT')}
                >
                  <Text style={[styles.segmentText, activeTab === 'AT' && styles.segmentTextActive]}>
                    Antiguo Testamento
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentBtn, activeTab === 'NT' && styles.segmentBtnActive]}
                  onPress={() => handleTabChange('NT')}
                >
                  <Text style={[styles.segmentText, activeTab === 'NT' && styles.segmentTextActive]}>
                    Nuevo Testamento
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.gridContainer} showsVerticalScrollIndicator={false}>
                <View style={styles.grid}>
                  {displayBooks.map(b => (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.bookPill, currentBook === b.name && styles.bookPillCurrent]}
                      onPress={() => setSelectedBook(b.name)}
                    >
                      <Text style={[styles.bookPillText, currentBook === b.name && styles.bookPillTextCurrent]} numberOfLines={1}>
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.gridContainer}>
              <Text style={styles.instruction}>Selecciona un capítulo</Text>
              <View style={styles.gridChapters}>
                {Array.from({ length: chapterCount }).map((_, i) => {
                  const num = i + 1;
                  return (
                    <TouchableOpacity
                      key={num}
                      style={styles.chapterBtn}
                      onPress={() => {
                        onSelect(selectedBook, num);
                        onClose();
                        setSelectedBook(null);
                      }}
                    >
                      <Text style={styles.chapterBtnText}>{num}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
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
  },
  content: {
    flex: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    padding: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radii.md,
  },
  tabActive: {
    backgroundColor: Colors.accent,
  },
  tabText: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  gridContainer: {
    padding: Spacing.md,
  },
  bookBtn: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: Spacing.md,
    borderRadius: Radii.md,
    marginBottom: Spacing.xs,
  },
  bookBtnCurrent: {
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderColor: Colors.accent,
    borderWidth: 1,
  },
  bookBtnText: {
    ...Typography.body,
    color: Colors.text,
    fontSize: 14,
  },
  bookBtnTextCurrent: {
    color: Colors.accent,
    fontWeight: 'bold',
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bookPillCurrent: {
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderColor: 'rgba(99, 102, 241, 0.5)',
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