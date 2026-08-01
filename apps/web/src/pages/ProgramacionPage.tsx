import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
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
  type LucideIcon,
} from 'lucide-react';
import { useTheme, useAzuraCast, mergeConsecutiveScheduleItems } from '@/hooks';
import { Header } from '@/components/ui-custom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { ScheduleItem, ScheduleCategorySummary } from '@radio/types';


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

const NEUTRAL_ACCENT = { dot: '#8b92a5', glow: 'rgba(139,146,165,0.18)' };

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

interface ScheduleSection {
  category: ScheduleCategorySummary | null;
  items: ScheduleItem[];
}

/** Single compact entry inside a section */
function ProgramRow({
  program,
  accent,
  onClick,
}: {
  program: ScheduleItem;
  accent: { dot: string; glow: string };
  onClick: () => void;
}) {
  const startTime = new Date(program.start_timestamp * 1000).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const endTime = new Date(program.end_timestamp * 1000).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const isLive = program.type === 'streamer';

  return (
    <motion.button
      whileTap={{ scale: 0.99 }}
      whileHover={{ y: -1 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors duration-150 shadow-sm hover:shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: accent.dot, boxShadow: `0 0 0 4px ${accent.glow}` }}
      />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-snug truncate">{program.title}</p>
        <p className="text-xs mt-0.5 text-muted-foreground">
          {startTime} → {endTime}
          {program.slots && program.slots > 1 ? ` · ${program.slots} bloques` : ''}
        </p>
      </div>
      {isLive && (
        <motion.span
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="flex-shrink-0 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{
            background: accent.glow,
            color: accent.dot,
            border: `1px solid ${accent.dot}40`,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: accent.dot }} />
          En Vivo
        </motion.span>
      )}
    </motion.button>
  );
}

function ScheduleSection({
  section,
  idx,
  onSelect,
}: {
  section: ScheduleSection;
  idx: number;
  onSelect: (program: ScheduleItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const accent = section.category
    ? { dot: section.category.color, glow: `${section.category.color}2e` }
    : NEUTRAL_ACCENT;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
      transition={{ duration: 0.45, delay: idx * 0.07, ease: [0.16, 1, 0.3, 1] }}
      className="mb-7 last:mb-0"
    >
      {/* Section header */}
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: accent.glow, color: accent.dot }}
        >
          <CategoryIcon category={section.category} className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm leading-tight truncate">
            {section.category ? section.category.name : 'Otros programas'}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {section.items.length} horario{section.items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <span
          className="flex-1 h-px mx-1 self-center"
          style={{ background: `${accent.dot}33` }}
        />
      </div>

      <div className="space-y-2">
        {section.items.map((program) => (
          <ProgramRow
            key={`${program.id}-${program.start_timestamp}`}
            program={program}
            accent={accent}
            onClick={() => onSelect(program)}
          />
        ))}
      </div>
    </motion.div>
  );
}

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
      className={`
        relative h-10 px-4 rounded-xl text-sm font-medium transition-colors duration-150 outline-none
        focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        ${isSelected
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        }
      `}
    >
      {label}
      {isToday && (
        <span
          className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
          style={{ background: '#4f98a3' }}
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
      className={`
        flex-shrink-0 flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-medium transition-colors duration-150 outline-none
        focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
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
        />
      )}
      {label}
    </motion.button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="h-3 w-28 rounded animate-pulse bg-muted" />
      <div className="h-4 w-48 rounded animate-pulse bg-muted" />
      <div className="h-3 w-32 rounded animate-pulse bg-secondary" />
    </div>
  );
}

export function ProgramacionPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const { fetchSchedule, fetchScheduleCategories } = useAzuraCast({});
  const [schedule, setSchedule]   = useState<ScheduleItem[]>([]);
  const [categories, setCategories] = useState<ScheduleCategorySummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<ScheduleItem | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const currentDay = getBogotaDayOfWeek(new Date());
  const [selectedDay, setSelectedDay] = useState(currentDay);

  useEffect(() => {
    async function loadSchedule() {
      try {
        const [data, categoryData] = await Promise.all([
          fetchSchedule(),
          fetchScheduleCategories(),
        ]);
        if (data) setSchedule(data);
        if (categoryData) setCategories(categoryData);
      } catch (err) {
        console.error('Error fetching schedule:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSchedule();
  }, [fetchSchedule, fetchScheduleCategories]);

  const sections = useMemo<ScheduleSection[]>(() => {
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

  const filteredCategory = categories.find(c => c.id === selectedCategoryId) ?? null;
  const totalSlots = sections.reduce((acc, section) => acc + section.items.length, 0);

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
            <Radio className="w-4 h-4" style={{ color: '#4f98a3' }} />
            <span
              className="text-xs font-semibold uppercase tracking-[0.14em]"
              style={{ color: '#4f98a3' }}
            >
              Horarios y Emisiones
            </span>
          </div>

          <h1
            className="font-bold leading-[1.1] tracking-tight mb-3"
            style={{ fontSize: 'clamp(2rem, 6vw, 2.8rem)' }}
          >
            Programación
          </h1>
          <p className="text-sm leading-relaxed max-w-sm text-muted-foreground">
            Todos nuestros programas, de lunes a domingo. Selecciona un día para ver los detalles.
          </p>
        </motion.header>

        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          aria-label="Seleccionar día"
          className="flex gap-1 p-1.5 rounded-2xl mb-6 overflow-x-auto no-scrollbar bg-muted"
        >
          {DAYS.map((day, i) => (
            <DayPill
              key={day}
              label={day}
              isSelected={selectedDay === i}
              isToday={currentDay === i}
              onClick={() => setSelectedDay(i)}
            />
          ))}
        </motion.nav>

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
                  {totalSlots} horario{totalSlots !== 1 ? 's' : ''} en {sections.length} tipo{sections.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {currentDay === selectedDay && (
              <span
                className="text-xs font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: isDark ? 'rgba(79,152,163,0.15)' : 'rgba(1,105,111,0.08)',
                  color: isDark ? '#4f98a3' : '#01696f',
                }}
              >
                Hoy
              </span>
            )}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={`day-${selectedDay}-${selectedCategoryId}`}
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
            ) : sections.length > 0 ? (
              sections.map((section, idx) => (
                <ScheduleSection
                  key={section.category?.id ?? '__none__'}
                  section={section}
                  idx={idx}
                  onSelect={setSelectedProgram}
                />
              ))
            ) : (
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
                      {new Date(selectedProgram.start_timestamp * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })} - {' '}
                      {new Date(selectedProgram.end_timestamp * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
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

      {/* Scrollbar hide */}
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
}

export default ProgramacionPage;
