import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchSchedule, fetchScheduleCategories, mergeConsecutiveScheduleItems } from '@radio/api';
import type { ScheduleItem, ScheduleCategorySummary } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';
import { Colors } from '@/constants/theme';
import { formatScheduleTime, getBogotaDayOfWeek } from '@/lib/time';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const CACHE_KEY = 'schedule_cache_v1';
const CACHE_TTL_MS = 1000 * 60 * 30;

interface ScheduleCache {
  schedule: ScheduleItem[];
  categories: ScheduleCategorySummary[];
  timestamp: number;
}

async function readScheduleCache(): Promise<ScheduleCache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScheduleCache;
    if (!Array.isArray(parsed.schedule) || !Array.isArray(parsed.categories)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeScheduleCache(cache: ScheduleCache): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage failures
  }
}


const CARD_BG = '#16162c';
const TEXT_MUTED = '#8b92a5';
const CIAN = '#4f98a3';
const CIAN_MUTED = 'rgba(79,152,163,0.15)';
const OVERLAY = 'rgba(0,0,0,0.7)';
const MODAL_BORDER = 'rgba(255,255,255,0.1)';

const NEUTRAL_ACCENT = { dot: TEXT_MUTED, glow: 'rgba(139,146,165,0.25)' };

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  music: 'musical-notes',
  mic: 'mic',
  radio: 'radio',
  book: 'book',
  flag: 'flag',
  bell: 'notifications',
  heart: 'heart',
  news: 'newspaper',
  sparkles: 'sparkles',
  user: 'person',
  star: 'star',
  message: 'chatbubble',
};

function getAccent(category: ScheduleCategorySummary | null | undefined) {
  if (category) {
    return { dot: category.color, glow: `${category.color}40` };
  }
  return NEUTRAL_ACCENT;
}

function getCategoryIcon(category: ScheduleCategorySummary | null | undefined): keyof typeof Ionicons.glyphMap {
  if (!category) return 'musical-notes';
  return CATEGORY_ICONS[category.icon] ?? 'radio';
}

interface ScheduleSection {
  category: ScheduleCategorySummary | null;
  items: ScheduleItem[];
}

function ProgramRow({
  program,
  accent,
  onPress,
}: {
  program: ScheduleItem;
  accent: { dot: string; glow: string };
  onPress: () => void;
}) {
  const startTime = formatScheduleTime(program.start_timestamp);
  const endTime = formatScheduleTime(program.end_timestamp);
  const isLive = program.type === 'streamer';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.rowCard}>
      <View style={[styles.rowDot, { backgroundColor: accent.dot }]} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>{program.title}</Text>
        <Text style={styles.rowTime}>
          {startTime} → {endTime}
          {program.slots && program.slots > 1 ? ` · ${program.slots} bloques` : ''}
        </Text>
      </View>
      {isLive && (
        <View style={[styles.rowLiveBadge, { backgroundColor: accent.glow, borderColor: accent.dot }]}>
          <View style={[styles.rowLiveDot, { backgroundColor: accent.dot }]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function ScheduleSectionView({
  section,
  onSelect,
}: {
  section: ScheduleSection;
  onSelect: (program: ScheduleItem) => void;
}) {
  const accent = getAccent(section.category);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: accent.glow }]}>
          <Ionicons name={getCategoryIcon(section.category)} size={16} color={accent.dot} />
        </View>
        <View style={styles.sectionHeaderInfo}>
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {section.category ? section.category.name : 'Otros programas'}
          </Text>
          <Text style={styles.sectionCount}>
            {section.items.length} horario{section.items.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={[styles.sectionLine, { backgroundColor: accent.dot }]} />
      </View>

      <View style={styles.sectionRows}>
        {section.items.map((program) => (
          <ProgramRow
            key={`${program.id}-${program.start_timestamp}`}
            program={program}
            accent={accent}
            onPress={() => onSelect(program)}
          />
        ))}
      </View>
    </View>
  );
}

function CategoryChip({
  label,
  color,
  isSelected,
  onPress,
}: {
  label: string;
  color?: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, isSelected && color ? { backgroundColor: color } : null]}
    >
      {color && (
        <View
          style={[
            styles.chipDot,
            { backgroundColor: isSelected ? Colors.textBright : color },
          ]}
        />
      )}
      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [categories, setCategories] = useState<ScheduleCategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<ScheduleItem | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const currentDay = getBogotaDayOfWeek(new Date());
  const [selectedDay, setSelectedDay] = useState(currentDay);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [data, categoryData] = await Promise.all([
        fetchSchedule(BACKEND_URL),
        fetchScheduleCategories(BACKEND_URL),
      ]);
      if (data) setSchedule(data);
      if (categoryData) setCategories(categoryData);
      if (data && categoryData) {
        await writeScheduleCache({
          schedule: data,
          categories: categoryData,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      console.error('Error refreshing schedule:', err);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSchedule() {
      const cached = await readScheduleCache();

      if (mounted && cached) {
        setSchedule(cached.schedule);
        setCategories(cached.categories);
      }

      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const [data, categoryData] = await Promise.all([
          fetchSchedule(BACKEND_URL),
          fetchScheduleCategories(BACKEND_URL),
        ]);
        if (!mounted) return;
        if (data) setSchedule(data);
        if (categoryData) setCategories(categoryData);
        if (data && categoryData) {
          await writeScheduleCache({
            schedule: data,
            categories: categoryData,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.error('Error fetching schedule:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSchedule();

    return () => {
      mounted = false;
    };
  }, []);

  const sections: ScheduleSection[] = React.useMemo(() => {
    const programsForDay = schedule
      .filter(item => getBogotaDayOfWeek(item.start_timestamp) === selectedDay)
      .sort((a, b) => a.start_timestamp - b.start_timestamp)
      .filter((item, index, self) =>
        index === self.findIndex(i => i.id === item.id && i.start_timestamp === item.start_timestamp)
      )
      .filter(item =>
        selectedCategoryId === null || item.category?.id === selectedCategoryId
      );

    const merged = mergeConsecutiveScheduleItems(programsForDay);

    const groups = new Map<string, ScheduleSection>();
    for (const item of merged) {
      const key = item.category?.id ?? '__none__';
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(key, { category: item.category ?? null, items: [item] });
      }
    }

    return [...groups.values()].sort((a, b) => {
      const indexOf = (category: ScheduleCategorySummary | null) => {
        if (!category) return categories.length;
        const idx = categories.findIndex(c => c.id === category.id);
        return idx === -1 ? categories.length : idx;
      };
      return indexOf(a.category) - indexOf(b.category);
    });
  }, [schedule, selectedDay, selectedCategoryId, categories]);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId) ?? null;
  const totalSlots = sections.reduce((acc, section) => acc + section.items.length, 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
      >
        
        {/* Cabecera */}
        <View style={styles.header}>
          <View style={styles.eyebrow}>
            <Ionicons name="radio" size={16} color={CIAN} />
            <Text style={styles.eyebrowText}>Horarios y Emisiones</Text>
          </View>
          <Text style={styles.mainTitle}>Programación</Text>
          <Text style={styles.subtitle}>
            Todos nuestros programas, de lunes a domingo. Selecciona un día para ver los detalles.
          </Text>
        </View>

        {/* Selector de Días */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.daysScroll}
          contentContainerStyle={styles.daysContainer}
        >
          {DAYS.map((day, i) => (
            <TouchableOpacity
              key={day}
              onPress={() => setSelectedDay(i)}
              style={[
                styles.dayPill,
                selectedDay === i && styles.dayPillSelected
              ]}
            >
              <Text style={[
                styles.dayText,
                selectedDay === i && styles.dayTextSelected
              ]}>
                {day}
              </Text>
              {currentDay === i && (
                <View style={styles.todayIndicator} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filtro por categoría */}
        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoriesScroll}
            contentContainerStyle={styles.categoriesContainer}
          >
            <CategoryChip
              label="Todas"
              isSelected={selectedCategoryId === null}
              onPress={() => setSelectedCategoryId(null)}
            />
            {categories.map((category) => (
              <CategoryChip
                key={category.id}
                label={category.name}
                color={category.color}
                isSelected={selectedCategoryId === category.id}
                onPress={() => setSelectedCategoryId(category.id)}
              />
            ))}
          </ScrollView>
        )}

        {/* Cabecera del día */}
        <View style={styles.dayHeader}>
          <View>
            <Text style={styles.dayTitle}>{DAYS_FULL[selectedDay]}</Text>
            {!loading && totalSlots > 0 && (
              <Text style={styles.programCount}>
                {totalSlots} horario{totalSlots !== 1 ? 's' : ''} en {sections.length} tipo{sections.length !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
          {currentDay === selectedDay && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>Hoy</Text>
            </View>
          )}
        </View>

        {/* Secciones por tipo */}
        {loading ? (
          <ActivityIndicator size="large" color={CIAN} style={{ marginTop: 40 }} />
        ) : sections.length > 0 ? (
          <View>
            {sections.map((section) => (
              <ScheduleSectionView
                key={section.category?.id ?? '__none__'}
                section={section}
                onSelect={setSelectedProgram}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="musical-notes" size={24} color={TEXT_MUTED} />
            </View>
            <Text style={styles.emptyTitle}>
              {selectedCategoryId ? 'Sin programas en esta categoría' : 'Programación continua'}
            </Text>
            <Text style={styles.emptyDesc}>
              {selectedCategoryId
                ? `No hay programas de "${selectedCategory?.name ?? 'esta categoría'}" agendados para este día.`
                : 'La radio transmite música continua este día. No hay eventos especiales agendados.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Program Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={!!selectedProgram}
        onRequestClose={() => setSelectedProgram(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedProgram?.title}</Text>
              <Pressable onPress={() => setSelectedProgram(null)} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={Colors.textBright} />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              {selectedProgram?.category && (
                <>
                  <View style={styles.detailRow}>
                    <Ionicons
                      name={getCategoryIcon(selectedProgram.category)}
                      size={18}
                      color={selectedProgram.category.color}
                    />
                    <Text style={[styles.categoryName, { color: selectedProgram.category.color }]}>
                      {selectedProgram.category.name}
                    </Text>
                  </View>
                  {selectedProgram.category.description && (
                    <Text style={styles.categoryDescription}>
                      {selectedProgram.category.description}
                    </Text>
                  )}
                </>
              )}
              <View style={styles.detailRow}>
                <Ionicons name="time-outline" size={18} color={TEXT_MUTED} />
                <Text style={styles.detailText}>
                  {selectedProgram
                    ? `${formatScheduleTime(selectedProgram.start_timestamp)} - ${formatScheduleTime(selectedProgram.end_timestamp)}`
                    : ''}
                </Text>
              </View>
              {selectedProgram?.slots && selectedProgram.slots > 1 && (
                <View style={styles.detailRow}>
                  <Ionicons name="layers-outline" size={18} color={TEXT_MUTED} />
                  <Text style={styles.detailText}>
                    Programado en {selectedProgram.slots} bloques consecutivos
                  </Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Ionicons 
                  name={selectedProgram?.type === 'streamer' ? "mic-outline" : "musical-notes-outline"} 
                  size={18} 
                  color={TEXT_MUTED} 
                />
                <Text style={styles.detailText}>
                  {selectedProgram?.type === 'streamer' ? 'Programa en vivo' : 'Programa automático'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  eyebrowText: {
    color: CIAN,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.textBright,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  daysScroll: {
    marginBottom: 12,
  },
  daysContainer: {
    gap: 8,
  },
  dayPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    position: 'relative',
  },
  dayPillSelected: {
    backgroundColor: Colors.accent,
  },
  dayText: {
    color: TEXT_MUTED,
    fontSize: 14,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: Colors.textBright,
  },
  todayIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CIAN,
  },
  categoriesScroll: {
    marginBottom: 20,
  },
  categoriesContainer: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: Colors.surface,
    maxWidth: 180,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    color: TEXT_MUTED,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: Colors.textBright,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dayTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textBright,
  },
  programCount: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  todayBadge: {
    backgroundColor: CIAN_MUTED,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todayBadgeText: {
    color: CIAN,
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderInfo: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: Colors.textBright,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionCount: {
    color: TEXT_MUTED,
    fontSize: 11,
    marginTop: 1,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    opacity: 0.25,
    marginLeft: 4,
  },
  sectionRows: {
    gap: 8,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceFaint,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowInfo: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: Colors.textBright,
    fontSize: 14,
    fontWeight: '600',
  },
  rowTime: {
    color: TEXT_MUTED,
    fontSize: 12,
    marginTop: 2,
  },
  rowLiveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  rowLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceFaint,
  },
  emptyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.surfaceFaint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: Colors.textBright,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    color: TEXT_MUTED,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: MODAL_BORDER,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceFaint,
  },
  modalTitle: {
    color: Colors.textBright,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    color: Colors.textBright,
    fontSize: 14,
    flex: 1,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  categoryDescription: {
    color: TEXT_MUTED,
    fontSize: 13,
    lineHeight: 18,
  },
});
