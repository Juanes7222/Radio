import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  Radio,
  Mic2,
  Music2,
  Book,
  Flag,
  Bell,
  Heart,
  Newspaper,
  Sparkles,
  User,
  Star,
  MessageSquare,
  LayoutGrid,
  Clock3,
  ChevronDown,
  ChevronsUpDown,
  type LucideIcon,
} from 'lucide-react';
import { useAzuraCast, mergeConsecutiveScheduleItems } from '@/hooks';
import { Header } from '@/components/ui-custom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiUrl } from '@/config';
import { formatChapters } from '@/lib/format';
import type { BibleReadingToday, ScheduleItem, ScheduleCategorySummary } from '@radio/types';

/** Strip order: Monday first, like the mobile app (JS day indexes, 0 = Sun). */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  music: Music2,
  mic: Mic2,
  radio: Radio,
  book: Book,
  flag: Flag,
  bell: Bell,
  heart: Heart,
  news: Newspaper,
  sparkles: Sparkles,
  user: User,
  star: Star,
  message: MessageSquare,
};

const DEFAULT_ICON: LucideIcon = Radio;

const NEUTRAL_ACCENT = {
  dot: 'hsl(var(--accent-neutral))',
  glow: 'hsl(var(--accent-neutral) / 0.18)',
};

function getBogotaDayOfWeek(dateInput: Date | number): number {
  const timestampInSeconds =
    typeof dateInput === 'number' ? dateInput : Math.floor(dateInput.getTime() / 1000);
  const date = new Date(timestampInSeconds * 1000);
  const utcDay = date.getUTCDay();
  const utcHours = date.getUTCHours();

  // Bogota is UTC-5. If UTC hour < 5, subtracting 5 moves to previous day.
  if (utcHours < 5) {
    return (utcDay - 1 + 7) % 7;
  }

  return utcDay;
}

function formatScheduleTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getAccent(category: ScheduleCategorySummary | null | undefined) {
  if (category) {
    return { dot: category.color, glow: `${category.color}2e` };
  }
  return NEUTRAL_ACCENT;
}

function CategoryIcon({
  category,
  className,
}: {
  category: ScheduleCategorySummary | null | undefined;
  className?: string;
}) {
  const Icon = category ? (CATEGORY_ICONS[category.icon] ?? DEFAULT_ICON) : Music2;
  return <Icon className={className} />;
}

/** Live/now pill shared by both views; text and emphasis follow program state. */
function LiveBadge({ program }: { program: ScheduleItem }) {
  const accent = getAccent(program.category);
  return (
    <span
      className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{
        background: accent.glow,
        color: accent.dot,
        border: `1px solid ${accent.dot}40`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent.dot }} />
      {program.is_now ? 'Ahora' : 'En vivo'}
    </span>
  );
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
  const segments: Array<{ value: ViewMode; label: string; Icon: LucideIcon }> = [
    { value: 'categories', label: 'Por categoría', Icon: LayoutGrid },
    { value: 'chronological', label: 'Cronológico', Icon: Clock3 },
  ];

  return (
    <div
      role="tablist"
      aria-label="Modo de vista"
      className="flex w-full sm:w-auto sm:self-start p-1 rounded-xl border border-border bg-card mb-4"
    >
      {segments.map(({ value, label, Icon }) => {
        const isSelected = mode === value;
        return (
          <button
            key={value}
            role="tab"
            aria-selected={isSelected}
            onClick={() => onChange(value)}
            className={`flex-1 sm:flex-none sm:px-5 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vista por categoría                                                 */
/* ------------------------------------------------------------------ */

function ProgramRow({
  program,
  accent,
  onClick,
}: {
  program: ScheduleItem;
  accent: { dot: string; glow: string };
  onClick: () => void;
}) {
  const isLive = program.type === 'streamer';

  return (
    <motion.button
      whileTap={{ scale: 0.99 }}
      whileHover={{ y: -1 }}
      onClick={onClick}
      style={program.is_now ? { borderColor: accent.dot } : undefined}
      className="w-full flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors duration-150 shadow-sm hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: accent.dot, boxShadow: `0 0 0 4px ${accent.glow}` }}
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-snug truncate">{program.title}</p>
        <p className="text-xs mt-0.5 text-muted-foreground">
          {formatScheduleTime(program.start_timestamp)} → {formatScheduleTime(program.end_timestamp)}
          {program.slots && program.slots > 1 ? ` · ${program.slots} bloques` : ''}
        </p>
      </div>
      {isLive && <LiveBadge program={program} />}
    </motion.button>
  );
}

function ScheduleSection({
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
    <div className="mb-7 last:mb-0">
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-2.5 mb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: accent.glow, color: accent.dot }}
        >
          <CategoryIcon category={section.category} className="w-4 h-4" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block font-semibold text-sm leading-tight truncate">
            {section.category ? section.category.name : 'Otros programas'}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {section.items.length} horario{section.items.length !== 1 ? 's' : ''}
          </span>
        </span>
        <span className="flex-1 h-px mx-1" style={{ background: `${accent.dot}33` }} />
        <motion.span
          animate={{ rotate: collapsed ? 0 : 180 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-muted-foreground shrink-0"
        >
          <ChevronDown className="w-4 h-4" aria-hidden />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-2"
          >
            {section.items.map((program) => (
              <ProgramRow
                key={`${program.id}-${program.start_timestamp}`}
                program={program}
                accent={accent}
                onClick={() => onSelect(program)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vista cronológica                                                   */
/* ------------------------------------------------------------------ */

function TimelineRow({
  program,
  isLast,
  onSelect,
}: {
  program: ScheduleItem;
  isLast: boolean;
  onSelect: (program: ScheduleItem) => void;
}) {
  const accent = getAccent(program.category);
  const isLive = program.type === 'streamer';

  return (
    <div className="flex gap-3">
      <span
        className={`w-20 shrink-0 pt-3 text-right font-mono text-xs font-semibold tabular-nums ${
          program.is_now ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        {formatScheduleTime(program.start_timestamp)}
      </span>

      <div className="relative flex flex-col items-center w-3.5 shrink-0">
        <span
          className="z-10 mt-3.5 w-3 h-3 rounded-full border-2 border-background shrink-0"
          style={{ background: accent.dot }}
          aria-hidden
        />
        {!isLast && (
          <span
            className="flex-1 w-0.5 -mt-1 mb-0.5 rounded-full"
            style={{ background: accent.glow }}
            aria-hidden
          />
        )}
      </div>

      <motion.button
        whileTap={{ scale: 0.99 }}
        whileHover={{ y: -1 }}
        onClick={() => onSelect(program)}
        style={program.is_now ? { borderColor: accent.dot } : undefined}
        className="flex-1 min-w-0 mb-4 rounded-xl border bg-card px-4 py-3 text-left transition-colors duration-150 shadow-sm hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 font-semibold text-sm leading-snug truncate">
            {program.title}
          </p>
          {isLive && <LiveBadge program={program} />}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5">
          <span
            className="w-[7px] h-[7px] rounded-full shrink-0"
            style={{ background: accent.dot }}
            aria-hidden
          />
          <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground">
            {program.category ? program.category.name : 'Otros programas'}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatScheduleTime(program.end_timestamp)}
            {program.slots && program.slots > 1 ? ` · ${program.slots} bloques` : ''}
          </span>
        </div>
      </motion.button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Selector de día                                                     */
/* ------------------------------------------------------------------ */

function DayPill({
  label,
  isSelected,
  isToday,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  isToday: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      role="tab"
      aria-selected={isSelected}
      aria-label={`${label}${isToday ? ' — hoy' : ''}`}
      className={`
        relative h-10 px-4 rounded-xl text-sm font-medium transition-colors duration-150 outline-none
        focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
        ${isSelected
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        }
      `}
    >
      {label}
      {isToday && (
        <span
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary"
          aria-hidden
        />
      )}
    </motion.button>
  );
}

function CategoryChip({
  label,
  color,
  isSelected,
  onClick,
}: {
  label: string;
  color?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      aria-pressed={isSelected}
      aria-label={`Filtrar por ${label}`}
      className={`
        flex-shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-medium transition-colors duration-150 outline-none
        focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background
        ${isSelected
          ? 'text-white shadow-sm'
          : 'text-muted-foreground hover:text-foreground bg-card border border-border'
        }
      `}
      style={isSelected && color ? { background: color } : undefined}
    >
      {color && (
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: isSelected ? '#ffffff' : color }}
          aria-hidden
        />
      )}
      {label}
    </motion.button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3 overflow-hidden relative">
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" aria-hidden />
      <div className="h-3 w-28 rounded animate-pulse bg-muted" />
      <div className="h-4 w-48 rounded animate-pulse bg-muted" />
      <div className="h-3 w-32 rounded animate-pulse bg-secondary" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

export function ProgramacionPage() {
  const { fetchSchedule, fetchScheduleCategories } = useAzuraCast({});
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [categories, setCategories] = useState<ScheduleCategorySummary[]>([]);
  const [reading, setReading] = useState<BibleReadingToday['reading']>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<ScheduleItem | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const currentDay = getBogotaDayOfWeek(new Date());
  const [selectedDay, setSelectedDay] = useState(currentDay);

  useEffect(() => {
    async function loadSchedule() {
      try {
        const [data, categoryData, readingData] = await Promise.all([
          fetchSchedule(),
          fetchScheduleCategories(),
          fetch(`${apiUrl('/api/bible')}/reading/today`).then((res) =>
            res.ok ? res.json() : ({ reading: null } as BibleReadingToday)
          ),
        ]);
        if (data) setSchedule(data);
        if (categoryData) setCategories(categoryData);
        if (readingData) setReading(readingData.reading ?? null);
      } catch (err) {
        console.error('Error fetching schedule:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSchedule();
  }, [fetchSchedule, fetchScheduleCategories]);

  const dayPrograms = useMemo<ScheduleItem[]>(() => {
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

  const sections = useMemo<ScheduleSection[]>(() => {
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

  const filteredCategory = categories.find(c => c.id === selectedCategoryId) ?? null;
  const totalSlots = sections.reduce((acc, section) => acc + section.items.length, 0);

  const sectionKeys = sections.map((section) => section.category?.id ?? '__none__');
  const allSectionsCollapsed =
    sectionKeys.length > 0 && sectionKeys.every((key) => collapsedSections.has(key));

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleAllSections = () => {
    setCollapsedSections(allSectionsCollapsed ? new Set() : new Set(sectionKeys));
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-background text-foreground">
        <Header stationName="La Voz de la Verdad" />
      <div className="max-w-2xl mx-auto px-5 py-14 sm:py-20">

        <motion.header
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12"
        >
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-4">
            <Radio className="w-4 h-4 text-brand" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
              Horarios y Emisiones
            </span>
          </div>

          <h1 className="fluid-title font-bold leading-[1.1] tracking-tight mb-3">
            Programación
          </h1>
          <p className="text-sm leading-relaxed max-w-sm text-muted-foreground">
            Todos nuestros programas, de lunes a domingo. Selecciona un día para ver los detalles.
          </p>
        </motion.header>

        {reading && reading.chapters.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 rounded-2xl border border-border bg-card p-4 sm:p-5 flex items-start gap-3.5"
          >
            <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-brand/15 text-brand">
              <Book className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
                Lectura de hoy
              </p>
              <p className="font-semibold text-sm sm:text-base mt-0.5 leading-snug">
                {formatChapters(reading.chapters)}
              </p>
              {reading.rotationName && (
                <p className="text-xs text-muted-foreground mt-1">
                  {reading.rotationName}
                </p>
              )}
            </div>
          </motion.div>
        )}

        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          aria-label="Seleccionar día"
          role="tablist"
          className="flex gap-1 p-1.5 rounded-2xl mb-4 overflow-x-auto no-scrollbar bg-muted"
        >
          {DAY_ORDER.map((dayIndex) => (
            <DayPill
              key={dayIndex}
              label={DAYS[dayIndex]}
              isSelected={selectedDay === dayIndex}
              isToday={currentDay === dayIndex}
              onClick={() => setSelectedDay(dayIndex)}
            />
          ))}
        </motion.nav>

        <ViewToggle mode={viewMode} onChange={setViewMode} />

        {categories.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            aria-label="Filtrar por tipo de programa"
            className="flex gap-2 mb-8 overflow-x-auto no-scrollbar pb-1"
          >
            <CategoryChip
              label="Todas"
              isSelected={selectedCategoryId === null}
              onClick={() => setSelectedCategoryId(null)}
            />
            {categories.map((category) => (
              <CategoryChip
                key={category.id}
                label={category.name}
                color={category.color}
                isSelected={selectedCategoryId === category.id}
                onClick={() => setSelectedCategoryId(category.id)}
              />
            ))}
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={`title-${selectedDay}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center justify-between mb-6"
          >
            <div>
              <h2 className="font-semibold text-lg">{DAYS_FULL[selectedDay]}</h2>
              {!loading && totalSlots > 0 && (
                <p className="text-xs mt-0.5 text-muted-foreground">
                  {viewMode === 'chronological'
                    ? `${totalSlots} horario${totalSlots !== 1 ? 's' : ''} en orden del día`
                    : `${totalSlots} horario${totalSlots !== 1 ? 's' : ''} en ${sections.length} tipo${sections.length !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {viewMode === 'categories' && sectionKeys.length > 1 && (
                <button
                  onClick={toggleAllSections}
                  className="flex items-center gap-1 text-xs font-medium text-brand outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  <ChevronsUpDown className="w-3.5 h-3.5" aria-hidden />
                  {allSectionsCollapsed ? 'Expandir todo' : 'Contraer todo'}
                </button>
              )}
              {currentDay === selectedDay && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-brand/15 text-brand">
                  Hoy
                </span>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={`day-${selectedDay}-${selectedCategoryId}-${viewMode}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? (
              /* Skeleton */
              <div>
                {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
              </div>
            ) : dayPrograms.length === 0 ? (
              /* Empty state */
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border p-12 flex flex-col items-center text-center gap-4 bg-card border-border"
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-secondary">
                  <Music2 className="w-5 h-5 opacity-40 text-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] mb-1">
                    {selectedCategoryId ? 'Sin programas en esta categoría' : 'Programación continua'}
                  </h3>
                  <p className="text-sm leading-relaxed max-w-[28ch] text-muted-foreground">
                    {selectedCategoryId
                      ? `No hay programas de "${filteredCategory?.name ?? 'esta categoría'}" agendados para este día.`
                      : 'La radio transmite música continua este día. No hay eventos especiales agendados.'}
                  </p>
                </div>
              </motion.div>
            ) : viewMode === 'chronological' ? (
              <div>
                {dayPrograms.map((program, index) => (
                  <TimelineRow
                    key={`${program.id}-${program.start_timestamp}`}
                    program={program}
                    isLast={index === dayPrograms.length - 1}
                    onSelect={setSelectedProgram}
                  />
                ))}
              </div>
            ) : (
              sections.map((section) => {
                const key = section.category?.id ?? '__none__';
                return (
                  <ScheduleSection
                    key={key}
                    section={section}
                    collapsed={collapsedSections.has(key)}
                    onToggle={() => toggleSection(key)}
                    onSelect={setSelectedProgram}
                  />
                );
              })
            )}
          </motion.div>
        </AnimatePresence>

      </div>

      {/* Program Detail Dialog */}
      <Dialog open={!!selectedProgram} onOpenChange={() => setSelectedProgram(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedProgram?.title}</DialogTitle>
            <DialogDescription>
              {selectedProgram && (
                <div className="space-y-3 mt-2">
                  {selectedProgram.category && (
                    <div className="flex items-center gap-2">
                      <CategoryIcon
                        category={selectedProgram.category}
                        className="w-4 h-4"
                      />
                      <span
                        className="text-sm font-medium"
                        style={{ color: selectedProgram.category.color }}
                      >
                        {selectedProgram.category.name}
                      </span>
                    </div>
                  )}
                  {selectedProgram.category?.description && (
                    <p className="text-sm text-muted-foreground">
                      {selectedProgram.category.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 opacity-60" />
                    <span className="text-sm">
                      {formatScheduleTime(selectedProgram.start_timestamp)} - {' '}
                      {formatScheduleTime(selectedProgram.end_timestamp)}
                    </span>
                  </div>
                  {selectedProgram.slots && selectedProgram.slots > 1 && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 opacity-60" />
                      <span className="text-sm">
                        Programado en {selectedProgram.slots} bloques consecutivos
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {selectedProgram.type === 'streamer' ? (
                      <>
                        <Mic2 className="w-4 h-4 opacity-60" />
                        <span className="text-sm">Programa en vivo</span>
                      </>
                    ) : (
                      <>
                        <Music2 className="w-4 h-4 opacity-60" />
                        <span className="text-sm">Programa automático</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Scrollbar hide is handled globally in index.css (.no-scrollbar) */}
    </div>
  );
}

export default ProgramacionPage;
