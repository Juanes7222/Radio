import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, SafeAreaView, TextInput, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BibleSearchResult } from '@radio/types';
import { Colors, Typography, Radii, Spacing } from '@/constants/theme';

interface BibleSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (bookName: string, chapterNumber: number) => void;
  onSearch: (query: string) => Promise<BibleSearchResult[]>;
}

export function BibleSearch({ isOpen, onClose, onSelect, onSearch }: BibleSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BibleSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [contentKey, setContentKey] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setHasSearched(true);
    const data = await onSearch(query);
    setResults(data);
    setIsSearching(false);
  };

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose} onShow={() => setContentKey(prev => prev + 1)}>
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
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Results */}
          <View style={styles.content} key={contentKey}>
            {isSearching ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={Colors.accent} />
                <Text style={styles.centerText}>Buscando en las escrituras...</Text>
              </View>
            ) : hasSearched && results.length === 0 ? (
              <View style={styles.centerBox}>
                <Ionicons name="search-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.centerText}>No se encontraron resultados para "{query}"</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.resultsContainer}>
                {results.map((verse) => (
                  <TouchableOpacity
                    key={verse.id}
                    style={styles.resultCard}
                    onPress={() => {
                      onSelect(verse.chapter.book.name, verse.chapter.number);
                      onClose();
                    }}
                  >
                    <Text style={styles.resultReference}>
                      {verse.chapter.book.name} {verse.chapter.number}:{verse.number}
                    </Text>
                    <Text style={styles.resultText}>{verse.text}</Text>
                  </TouchableOpacity>
                ))}
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
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radii.md,
    padding: Spacing.md,
  },
  resultReference: {
    ...Typography.body,
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  resultText: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
  },
});