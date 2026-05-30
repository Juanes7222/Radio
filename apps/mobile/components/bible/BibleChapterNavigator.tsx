import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, SafeAreaView, Pressable } from 'react-native';
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
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              {selectedBook ? (
                <TouchableOpacity onPress={() => setSelectedBook(null)} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color={Colors.text} />
                  <Text style={styles.headerTitle}>{selectedBook}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.headerTitle}>Seleccionar</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {!selectedBook ? (
            <View style={styles.content}>
              <View style={styles.tabsRow}>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'AT' && styles.tabActive]}
                  onPress={() => handleTabChange('AT')}
                >
                  <Text style={[styles.tabText, activeTab === 'AT' && styles.tabTextActive]}>
                    Antiguo Testamento
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'NT' && styles.tabActive]}
                  onPress={() => handleTabChange('NT')}
                >
                  <Text style={[styles.tabText, activeTab === 'NT' && styles.tabTextActive]}>
                    Nuevo Testamento
                  </Text>
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.gridContainer}>
                <View style={styles.grid}>
                  {displayBooks.map(b => (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.bookBtn, currentBook === b.name && styles.bookBtnCurrent]}
                      onPress={() => setSelectedBook(b.name)}
                    >
                      <Text style={[styles.bookBtnText, currentBook === b.name && styles.bookBtnTextCurrent]} numberOfLines={1}>
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.gridContainer}>
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
                        setSelectedBook(null); // Reset for next open
                      }}
                    >
                      <Text style={styles.chapterBtnText}>{num}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
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
    backgroundColor: '#0c0c1e', // matching radio player theme
    height: '85%',
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
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
  gridChapters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  chapterBtn: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.md,
  },
  chapterBtnText: {
    ...Typography.screenTitle,
    color: Colors.text,
  },
});