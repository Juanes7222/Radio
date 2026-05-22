import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Clock, Radio, Mic2, Music2 } from 'lucide-react';
import { useTheme, useAzuraCast } from '@/hooks';
import type { ScheduleItem } from '@radio/types';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Accent per slot index — maps to CSS custom properties */
const SLOT_ACCENTS = [
  { dot: '#e8883a', glow: 'rgba(232,136,58,0.18)', label: 'bg-[#e8883a]' },
  { dot: '#4f98a3', glow: 'rgba(79,152,163,0.18)', label: 'bg-[#4f98a3]' },
  { dot: '#a86fdf', glow: 'rgba(168,111,223,0.18)', label: 'bg-[#a86fdf]' },
  { dot: '#6daa45', glow: 'rgba(109,170,69,0.18)',  label: 'bg-[#6daa45]' },
  { dot: '#dd6974', glow: 'rgba(221,105,116,0.18)', label: 'bg-[#dd6974]' },
  { dot: '#e8af34', glow: 'rgba(232,175,52,0.18)',  label: 'bg-[#e8af34]' },
];


/** Animated vertical timeline line */
function TimelineLine({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div ref={ref} className="absolute left-[22px] top-0 bottom-0 w-px overflow-hidden">
      <motion.div
        className="w-full bg-gradient-to-b from-transparent via-current to-transparent opacity-20"
        initial={{ scaleY: 0, originY: 0 }}
        animate={inView ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: 0.9 + count * 0.08, ease: [0.16, 1, 0.3, 1] }}
        style={{ height: '100%' }}
      />
    </div>
  );
}

/** Single timeline entry */
function ProgramCard({
  program,
  idx,
  isDark,
}: {
  program: ScheduleItem;
  idx: number;
  isDark: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const accent = SLOT_ACCENTS[idx % SLOT_ACCENTS.length];

  const startD = new Date(program.start_timestamp * 1000);
  const endD   = new Date(program.end_timestamp   * 1000);
  const startTime = startD.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const endTime   = endD.toLocaleTimeString('es-CO',   { hour: '2-digit', minute: '2-digit' });
  const isLive    = program.type === 'streamer';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -16 }}
      animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
      transition={{ duration: 0.5, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex gap-5 pl-14 pb-8 last:pb-0"
    >
      {/* Timeline dot */}
      <span
        className="absolute left-[14px] top-[18px] w-[18px] h-[18px] rounded-full border-2 border-current flex-shrink-0 z-10 flex items-center justify-center"
        style={{
          background: accent.dot,
          borderColor: accent.dot,
          boxShadow: `0 0 0 6px ${accent.glow}`,
        }}
      />

      {/* Card */}
      <motion.div
        whileHover={{ y: -2, boxShadow: `0 8px 24px ${accent.glow}` }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className={`
          flex-1 rounded-2xl overflow-hidden border
          ${isDark
            ? 'bg-[#1c1b19] border-[#2e2d2a]'
            : 'bg-white border-[#e8e5e0]'}
          transition-colors duration-200
        `}
        style={{ boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.06)' }}
      >
        {/* Accent strip */}
        <div className="h-1 w-full" style={{ background: accent.dot }} />

        <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Time column */}
          <div className="flex-shrink-0 flex flex-row sm:flex-col sm:items-center gap-3 sm:gap-1 sm:w-24">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 opacity-50" />
              <span className="font-mono font-semibold text-[15px] tracking-tight">{startTime}</span>
            </div>
            <span className="text-xs opacity-40">→ {endTime}</span>
          </div>

          {/* Divider */}
          <div
            className="hidden sm:block w-px self-stretch"
            style={{ background: isDark ? '#2e2d2a' : '#e8e5e0' }}
          />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-[15px] leading-snug truncate">{program.title}</h3>
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
            </div>

            <div className="mt-1.5 flex items-center gap-2">
              {isLive ? (
                <Mic2 className="w-3.5 h-3.5 opacity-50" />
              ) : (
                <Music2 className="w-3.5 h-3.5 opacity-50" />
              )}
              <span className="text-xs opacity-50">
                {isLive ? 'Programa en vivo con locutor' : 'Programa automático'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Day selector pill */
function DayPill({
  label,
  isSelected,
  isToday,
  isDark,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  isToday: boolean;
  isDark: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.93 }}
      onClick={onClick}
      className={`
        relative h-10 px-4 rounded-xl text-sm font-medium transition-colors duration-150 outline-none
        focus-visible:ring-2 focus-visible:ring-offset-2
        ${isSelected
          ? isDark
            ? 'text-[#1c1b19] bg-[#cdccca]'
            : 'text-white bg-[#28251d]'
          : isDark
            ? 'text-[#797876] hover:text-[#cdccca] hover:bg-[#252422]'
            : 'text-[#7a7974] hover:text-[#28251d] hover:bg-[#efede8]'
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

/** Skeleton card for loading state */
function SkeletonCard({ isDark }: { isDark: boolean }) {
  return (
    <div className="relative flex gap-5 pl-14 pb-8">
      <span
        className="absolute left-[14px] top-[18px] w-[18px] h-[18px] rounded-full"
        style={{ background: isDark ? '#2e2d2a' : '#e8e5e0' }}
      />
      <div
        className={`flex-1 rounded-2xl border p-5 space-y-3 ${isDark ? 'bg-[#1c1b19] border-[#2e2d2a]' : 'bg-white border-[#e8e5e0]'}`}
      >
        <div
          className="h-3 w-24 rounded animate-pulse"
          style={{ background: isDark ? '#2e2d2a' : '#e8e5e0' }}
        />
        <div
          className="h-4 w-48 rounded animate-pulse"
          style={{ background: isDark ? '#2e2d2a' : '#e8e5e0' }}
        />
        <div
          className="h-3 w-32 rounded animate-pulse"
          style={{ background: isDark ? '#252422' : '#f3f0eb' }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Page
───────────────────────────────────────────── */
export function ProgramacionPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const { fetchSchedule } = useAzuraCast({});
  const [schedule, setSchedule]   = useState<ScheduleItem[]>([]);
  const [loading, setLoading]     = useState(true);

  const currentDay = new Date().getDay();
  const [selectedDay, setSelectedDay] = useState(currentDay);

  useEffect(() => {
    async function loadSchedule() {
      try {
        const data = await fetchSchedule();
        if (data) setSchedule(data);
      } catch (err) {
        console.error('Error fetching schedule:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSchedule();
  }, [fetchSchedule]);

  const programsForDay = schedule
    .filter(item => new Date(item.start_timestamp * 1000).getDay() === selectedDay)
    .sort((a, b) => a.start_timestamp - b.start_timestamp);

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ background: isDark ? '#171614' : '#f7f6f2', color: isDark ? '#cdccca' : '#28251d' }}
    >
      <div className="max-w-2xl mx-auto px-5 py-14 sm:py-20">

        {/* ── Header ───────────────────────────────── */}
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
          <p className="text-sm leading-relaxed max-w-sm" style={{ color: isDark ? '#797876' : '#7a7974' }}>
            Todos nuestros programas, de lunes a domingo. Selecciona un día para ver los detalles.
          </p>
        </motion.header>

        {/* ── Day Selector ─────────────────────────── */}
        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          aria-label="Seleccionar día"
          className={`
            flex gap-1 p-1.5 rounded-2xl mb-10 overflow-x-auto no-scrollbar
            ${isDark ? 'bg-[#1c1b19]' : 'bg-[#ededea]'}
          `}
        >
          {DAYS.map((day, i) => (
            <DayPill
              key={day}
              label={day}
              isSelected={selectedDay === i}
              isToday={currentDay === i}
              isDark={isDark}
              onClick={() => setSelectedDay(i)}
            />
          ))}
        </motion.nav>

        {/* ── Day Title ────────────────────────────── */}
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
              {!loading && programsForDay.length > 0 && (
                <p className="text-xs mt-0.5" style={{ color: isDark ? '#797876' : '#7a7974' }}>
                  {programsForDay.length} programa{programsForDay.length !== 1 ? 's' : ''}
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

        {/* ── Timeline ─────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`day-${selectedDay}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            {loading ? (
              /* Skeleton */
              <div>
                {[0, 1, 2].map(i => <SkeletonCard key={i} isDark={isDark} />)}
              </div>
            ) : programsForDay.length > 0 ? (
              <div className="relative">
                <TimelineLine count={programsForDay.length} />
                {programsForDay.map((program, idx) => (
                  <ProgramCard
                    key={`${program.id}-${program.start_timestamp}`}
                    program={program}
                    idx={idx}
                    isDark={isDark}
                  />
                ))}
              </div>
            ) : (
              /* Empty state */
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className={`
                  rounded-2xl border p-12 flex flex-col items-center text-center gap-4
                  ${isDark ? 'bg-[#1c1b19] border-[#2e2d2a]' : 'bg-white border-[#e8e5e0]'}
                `}
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: isDark ? '#252422' : '#f3f0eb' }}
                >
                  <Music2 className="w-5 h-5 opacity-40" />
                </div>
                <div>
                  <h3 className="font-semibold text-[15px] mb-1">Programación continua</h3>
                  <p className="text-sm leading-relaxed max-w-[28ch]" style={{ color: isDark ? '#797876' : '#7a7974' }}>
                    La radio transmite música continua este día. No hay eventos especiales agendados.
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

      </div>

      {/* Scrollbar hide */}
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
}

export default ProgramacionPage;