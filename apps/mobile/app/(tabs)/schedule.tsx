import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { fetchSchedule, fetchScheduleCategories, mergeConsecutiveScheduleItems } from '@radio/api';
import type { ScheduleItem, ScheduleCategorySummary } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';
import { Colors } from '@/constants/theme';
import { formatScheduleTime, getBogotaDayOfWeek } from '@/lib/time';
import { SCHEDULE_CACHE_TTL_MS, readScheduleCache, writeScheduleCache } from '@/lib/scheduleCache';
import { AppBottomSheet } from '@/components/ui/AppBottomSheet';
import { ShimmerBox } from '@/components/ui/Shimmer';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const CARD_BG = Colors.inkElevated;
const TEXT_MUTED = Colors.textMuted;
const CIAN = Colors.signal;
const CIAN_MUTED = Colors.signalMuted;
const OVERLAY = 'rgba(0,0,0,0.64)';
const MODAL_BORDER = Colors.borderGlass;

const NEUTRAL_ACCENT = { dot: Colors.textFaint, glow: 'rgba(248,247,255,0.12)' };

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

type ViewMode = 'categories' | 'chronological';

/* ------------------------------------------------------------------ */
/* Toggle entre vistas                                                 */
/* ------------------------------------------------------------------ */

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const handleChange = (next: ViewMode) => {
    if (next !== mode) Haptics.selectionAsync().catch(() => {});
    onChange(next);
  };
  return (
    <View style={styles.viewToggle}>
      <TouchableOpacity
        onPress={() => handleChange('categories')}
        activeOpacity={0.8}
        style={[styles.viewToggleSegment, mode === 'categories' && styles.viewToggleSegmentActive]}
      >
        <Ionicons
          name="grid-outline"
          size={15}
          color={mode === 'categories' ? Colors.textBright : TEXT_MUTED}
        />
        <Text style={[styles.viewToggleText, mode === 'categories' && styles.viewToggleTextActive]}>
          Por categoría
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => handleChange('chronological')}
        activeOpacity={0.8}
        style={[styles.viewToggleSegment, mode === 'chronological' && styles.viewToggleSegmentActive]}
      >
        <Ionicons
          name="time-outline"
          size={15}
          color={mode === 'chronological' ? Colors.textBright : TEXT_MUTED}
        />
        <Text style={[styles.viewToggleText, mode === 'chronological' && styles.viewToggleTextActive]}>
          Cronológico
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Filtro de categorías                                                */
/* ------------------------------------------------------------------ */

function CategoryFilterButton({
  selectedCategory,
  onPress,
}: {
  selectedCategory: ScheduleCategorySummary | null;
  onPress: () => void;
}) {
  const accent = getAccent(selectedCategory);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.filterButton}>
      <Ionicons name="funnel-outline" size={15} color={accent.dot} />
      <Text style={styles.filterButtonText} numberOfLines={1}>
        {selectedCategory ? selectedCategory.name : 'Todas las categorías'}
      </Text>
      <Ionicons name="chevron-down" size={15} color={TEXT_MUTED} />
    </TouchableOpacity>
  );
}

function CategoryPickerModal({
  visible,
  categories,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  categories: ScheduleCategorySummary[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const options: Array<{ id: string | null; name: string; color?: string; icon?: string }> = [
    { id: null, name: 'Todas las categorías' },
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
    })),
  ];

  return (
    <AppBottomSheet visible={visible} onClose={onClose} snapPoints={['48%', '68%']}>
      <Text style={styles.pickerTitle}>Filtrar por categoría</Text>
      <ScrollView style={styles.pickerList} bounces={false} showsVerticalScrollIndicator={false}>
        {options.map((option) => {
          const isSelected = option.id === selectedId;
          const dotColor = option.color ?? TEXT_MUTED;
          const iconName: keyof typeof Ionicons.glyphMap = option.icon
            ? CATEGORY_ICONS[option.icon] ?? 'radio'
            : 'albums-outline';

          return (
            <TouchableOpacity
              key={option.id ?? '__all__'}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onSelect(option.id);
              }}
              activeOpacity={0.8}
              style={[styles.pickerOption, isSelected && styles.pickerOptionSelected]}
            >
              <View style={[styles.pickerOptionIcon, { backgroundColor: `${dotColor}26` }]}>
                <Ionicons name={iconName} size={16} color={dotColor} />
              </View>
              <Text
                style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextSelected]}
                numberOfLines={1}
              >
                {option.name}
              </Text>
              {isSelected && <Ionicons name="checkmark" size={18} color={CIAN} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </AppBottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Vista por categoría                                                 */
/* ------------------------------------------------------------------ */

function ProgramRow({
  program,
  accent,
  onPress,
  index = 0,
}: {
  program: ScheduleItem;
  accent: { dot: string; glow: string };
  onPress: () => void;
  index?: number;
}) {
  const startTime = formatScheduleTime(program.start_timestamp);
  const endTime = formatScheduleTime(program.end_timestamp);
  const isLive = program.type === 'streamer';
  const isNow = program.is_now;

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index * 32, 160)).duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
      layout={LinearTransition.duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
    >
      <TouchableOpacity
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onPress();
        }}
        activeOpacity={0.8}
        style={[styles.rowCard, isNow && styles.rowCardNow]}
      >
        <View style={[styles.rowDot, { backgroundColor: accent.dot }]} />
        <View style={styles.rowInfo}>
          <Text style={styles.rowTitle} numberOfLines={1}>{program.title}</Text>
          <Text style={styles.rowTime}>
            {startTime} → {endTime}
            {program.slots && program.slots > 1 ? ` · ${program.slots} bloques` : ''}
          </Text>
        </View>
        {isLive && (
          <View style={[styles.liveBadge, { backgroundColor: accent.glow }]}>
            <View style={[styles.liveBadgeDot, { backgroundColor: accent.dot }]} />
            <Text style={[styles.liveBadgeText, { color: accent.dot }]}>
              {isNow ? 'AHORA' : 'EN VIVO'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function ScheduleSectionView({
  section,
  collapsed,
  onToggle,
  onSelect,
}: {
  section: ScheduleSection;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (program: ScheduleItem) => void;
}) {
  const accent = getAccent(section.category);

  return (
    <Animated.View layout={LinearTransition.duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))} style={styles.section}>
      <TouchableOpacity onPress={() => { Haptics.selectionAsync().catch(() => {}); onToggle(); }} activeOpacity={0.8} style={styles.sectionHeader}>
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
        <Animated.View style={{ transform: [{ rotate: collapsed ? '0deg' : '180deg' }] }}>
          <Ionicons
            name="chevron-down"
            size={16}
            color={TEXT_MUTED}
          />
        </Animated.View>
      </TouchableOpacity>

      {!collapsed && (
        <Animated.View
          entering={FadeIn.duration(220).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          exiting={FadeOut.duration(180).easing(Easing.bezier(0.4, 0, 1, 1))}
          style={styles.sectionRows}
        >
          {section.items.map((program, idx) => (
            <ProgramRow
              key={`${program.id}-${program.start_timestamp}`}
              program={program}
              accent={accent}
              index={idx}
              onPress={() => onSelect(program)}
            />
          ))}
        </Animated.View>
      )}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Vista cronológica                                                   */
/* ------------------------------------------------------------------ */

function TimelineRow({
  program,
  isLast,
  onPress,
  index = 0,
}: {
  program: ScheduleItem;
  isLast: boolean;
  onPress: () => void;
  index?: number;
}) {
  const accent = getAccent(program.category);
  const startTime = formatScheduleTime(program.start_timestamp);
  const endTime = formatScheduleTime(program.end_timestamp);
  const isLive = program.type === 'streamer';
  const isNow = program.is_now;

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index * 28, 140)).duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
      layout={LinearTransition.duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
      style={styles.timelineRow}
    >
      <Text style={[styles.timelineTime, isNow && styles.timelineTimeNow]}>{startTime}</Text>

      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, { backgroundColor: accent.dot }]} />
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: accent.glow }]} />}
      </View>

      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
        activeOpacity={0.8}
        style={[styles.timelineCard, isNow && styles.timelineCardNow]}
      >
        <View style={styles.timelineCardTop}>
          <Text style={styles.timelineTitle} numberOfLines={1}>
            {program.title}
          </Text>
          {isLive && (
            <View style={[styles.liveBadge, { backgroundColor: accent.glow }]}>
              <View style={[styles.liveBadgeDot, { backgroundColor: accent.dot }]} />
              <Text style={[styles.liveBadgeText, { color: accent.dot }]}>
                {isNow ? 'AHORA' : 'EN VIVO'}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.timelineMeta}>
          <View style={[styles.timelineCategoryDot, { backgroundColor: accent.dot }]} />
          <Text style={styles.timelineCategory} numberOfLines={1}>
            {program.category ? program.category.name : 'Otros programas'}
          </Text>
          <Text style={styles.timelineRange}>
            {endTime}
            {program.slots && program.slots > 1 ? ` · ${program.slots} bloques` : ''}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Pantalla principal                                                  */
/* ------------------------------------------------------------------ */

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { programTitle } = useLocalSearchParams<{ programTitle?: string }>();
  const handledProgramRef = useRef<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [categories, setCategories] = useState<ScheduleCategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<ScheduleItem | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

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

      if (cached && Date.now() - cached.timestamp < SCHEDULE_CACHE_TTL_MS) {
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

  // Open the program detail modal when the user arrives from a
  // program_start notification carrying the program title.
  useEffect(() => {
    const target = typeof programTitle === 'string' ? programTitle.trim() : '';
    if (!target || handledProgramRef.current === target) return;
    if (loading || schedule.length === 0) return;

    const normalized = normalizeTitle(target);
    const found = schedule.find((item) => normalizeTitle(item.title) === normalized);
    if (found) {
      handledProgramRef.current = target;
      setSelectedDay(getBogotaDayOfWeek(found.start_timestamp));
      setSelectedProgram(found);
    }
  }, [programTitle, loading, schedule]);

  const dayPrograms = React.useMemo(() => {
    const programsForDay = schedule
      .filter(item => getBogotaDayOfWeek(item.start_timestamp) === selectedDay)
      .sort((a, b) => a.start_timestamp - b.start_timestamp)
      .filter((item, index, self) =>
        index === self.findIndex(i => i.id === item.id && i.start_timestamp === item.start_timestamp)
      )
      .filter(item =>
        selectedCategoryId === null || item.category?.id === selectedCategoryId
      );

    return mergeConsecutiveScheduleItems(programsForDay);
  }, [schedule, selectedDay, selectedCategoryId]);

  const sections: ScheduleSection[] = React.useMemo(() => {
    const groups = new Map<string, ScheduleSection>();
    for (const item of dayPrograms) {
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
  }, [dayPrograms, categories]);

  const selectedCategory = categories.find(c => c.id === selectedCategoryId) ?? null;
  const totalSlots = sections.reduce((acc, section) => acc + section.items.length, 0);

  const sectionKeys = sections.map((section) => section.category?.id ?? '__none__');
  const allSectionsCollapsed =
    sectionKeys.length > 0 && sectionKeys.every((key) => collapsedCategories.has(key));

  const toggleCategoryCollapse = useCallback((key: string) => {
    Haptics.selectionAsync().catch(() => {});
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleToggleAllSections = () => {
    Haptics.selectionAsync().catch(() => {});
    setCollapsedCategories(allSectionsCollapsed ? new Set() : new Set(sectionKeys));
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={{ gap: 12, marginTop: 8 }}>
          {[0,1,2,3].map((i) => (
            <Animated.View
              key={i}
              entering={FadeInDown.delay(i * 60).duration(280).easing(Easing.bezier(0.16, 1, 0.3, 1))}
            >
              <View style={[styles.rowCard, { opacity: 0.9 - i*0.08 }]}>
                <ShimmerBox style={[styles.rowDot, { backgroundColor: Colors.surfaceElevated }]} borderRadius={5} />
                <View style={{ flex: 1, gap: 6 }}>
                  <ShimmerBox style={{ height: 12, width: `${68 - i * 7}%` }} borderRadius={6} />
                  <ShimmerBox style={{ height: 8, width: 90, opacity: 0.7 }} borderRadius={4} />
                </View>
                <ShimmerBox style={{ width: 64, height: 22, opacity: 0.5 }} borderRadius={8} />
              </View>
            </Animated.View>
          ))}
          <ActivityIndicator size="small" color={CIAN} style={{ marginTop: 12 }} />
        </View>
      );
    }

    if (dayPrograms.length === 0) {
      return (
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
      );
    }

    if (viewMode === 'chronological') {
      return (
        <Animated.View layout={LinearTransition.duration(260)}>
          {dayPrograms.map((program, index) => (
            <TimelineRow
              key={`${program.id}-${program.start_timestamp}`}
              program={program}
              isLast={index === dayPrograms.length - 1}
              index={index}
              onPress={() => setSelectedProgram(program)}
            />
          ))}
        </Animated.View>
      );
    }

    return (
      <View>
        {sections.map((section) => {
          const sectionKey = section.category?.id ?? '__none__';
          return (
            <ScheduleSectionView
              key={sectionKey}
              section={section}
              collapsed={collapsedCategories.has(sectionKey)}
              onToggle={() => toggleCategoryCollapse(sectionKey)}
              onSelect={setSelectedProgram}
            />
          );
        })}
      </View>
    );
  };

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
            <Animated.View
              key={day}
              entering={FadeInDown.delay(Math.min(i * 28, 160)).duration(260).easing(Easing.bezier(0.16, 1, 0.3, 1))}
              layout={LinearTransition.duration(200)}
            >
              <TouchableOpacity
                onPress={() => {
                  if (selectedDay !== i) Haptics.selectionAsync().catch(() => {});
                  setSelectedDay(i);
                }}
                activeOpacity={0.8}
                style={[
                  styles.dayPill,
                  selectedDay === i && styles.dayPillSelected,
                ]}
              >
                <Text style={[
                  styles.dayText,
                  selectedDay === i && styles.dayTextSelected,
                ]}>
                  {day}
                </Text>
                {currentDay === i && (
                  <View style={styles.todayIndicator} />
                )}
              </TouchableOpacity>
            </Animated.View>
          ))}
        </ScrollView>

        {/* Alternar vista por categoría / cronológica */}
        <ViewToggle mode={viewMode} onChange={setViewMode} />

        {/* Filtro por categoría */}
        <CategoryFilterButton
          selectedCategory={selectedCategory}
          onPress={() => setShowCategoryPicker(true)}
        />

        {/* Cabecera del día */}
        <View style={styles.dayHeader}>
          <View>
            <Text style={styles.dayTitle}>{DAYS_FULL[selectedDay]}</Text>
            {!loading && totalSlots > 0 && (
              <Text style={styles.programCount}>
                {viewMode === 'chronological'
                  ? `${totalSlots} horario${totalSlots !== 1 ? 's' : ''} en orden del día`
                  : `${totalSlots} horario${totalSlots !== 1 ? 's' : ''} en ${sections.length} tipo${sections.length !== 1 ? 's' : ''}`}
              </Text>
            )}
            {viewMode === 'categories' && sectionKeys.length > 1 && (
              <TouchableOpacity
                onPress={handleToggleAllSections}
                activeOpacity={0.8}
                style={styles.collapseAllButton}
              >
                <Ionicons
                  name={allSectionsCollapsed ? 'expand-outline' : 'contract-outline'}
                  size={14}
                  color={CIAN}
                />
                <Text style={styles.collapseAllText}>
                  {allSectionsCollapsed ? 'Expandir todo' : 'Contraer todo'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {currentDay === selectedDay && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>Hoy</Text>
            </View>
          )}
        </View>

        {/* Contenido según la vista */}
        {renderContent()}
      </ScrollView>

      {/* Selector de categorías */}
      <CategoryPickerModal
        visible={showCategoryPicker}
        categories={categories}
        selectedId={selectedCategoryId}
        onSelect={(id) => {
          setSelectedCategoryId(id);
          setShowCategoryPicker(false);
        }}
        onClose={() => setShowCategoryPicker(false)}
      />

      {/* Program Detail Sheet */}
      <AppBottomSheet
        visible={!!selectedProgram}
        onClose={() => setSelectedProgram(null)}
        snapPoints={['44%', '62%']}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{selectedProgram?.title}</Text>
          <Pressable onPress={() => setSelectedProgram(null)} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.modalBody}>
          {selectedProgram?.category && (
            <>
              <View style={styles.detailRow}>
                <View style={[styles.sectionIcon, { backgroundColor: selectedProgram.category ? `${selectedProgram.category.color}26` : NEUTRAL_ACCENT.glow }]}>
                  <Ionicons
                    name={getCategoryIcon(selectedProgram.category)}
                    size={16}
                    color={selectedProgram.category.color}
                  />
                </View>
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
      </AppBottomSheet>
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
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    padding: 4,
    marginBottom: 12,
  },
  viewToggleSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewToggleSegmentActive: {
    backgroundColor: Colors.accent,
  },
  viewToggleText: {
    color: TEXT_MUTED,
    fontSize: 13,
    fontWeight: '600',
  },
  viewToggleTextActive: {
    color: Colors.textBright,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
    maxWidth: '100%',
  },
  filterButtonText: {
    color: Colors.textBright,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
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
  collapseAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  collapseAllText: {
    color: CIAN,
    fontSize: 12,
    fontWeight: '600',
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
  rowCardNow: {
    borderColor: CIAN,
    borderWidth: 1.5,
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
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  timelineTime: {
    width: 74,
    color: TEXT_MUTED,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    paddingTop: 13,
  },
  timelineTimeNow: {
    color: CIAN,
  },
  timelineRail: {
    alignItems: 'center',
    width: 14,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.background,
    marginTop: 14,
    zIndex: 1,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginTop: 2,
  },
  timelineCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceFaint,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timelineCardNow: {
    borderColor: CIAN,
    borderWidth: 1.5,
  },
  timelineCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineTitle: {
    flex: 1,
    color: Colors.textBright,
    fontSize: 14,
    fontWeight: '600',
  },
  timelineMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  timelineCategoryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  timelineCategory: {
    flex: 1,
    color: TEXT_MUTED,
    fontSize: 12,
  },
  timelineRange: {
    color: TEXT_MUTED,
    fontSize: 12,
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
  pickerOverlay: {
    flex: 1,
    backgroundColor: OVERLAY,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: MODAL_BORDER,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  pickerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12,
  },
  pickerTitle: {
    color: Colors.textBright,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  pickerList: {
    flexShrink: 1,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
  },
  pickerOptionSelected: {
    backgroundColor: 'rgba(79,152,163,0.12)',
  },
  pickerOptionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerOptionText: {
    flex: 1,
    color: Colors.textBright,
    fontSize: 14,
    fontWeight: '500',
  },
  pickerOptionTextSelected: {
    fontWeight: '700',
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
