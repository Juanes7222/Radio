import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Clock, Radio, Mic2, Music2 } from 'lucide-react';
import { useTheme, useAzuraCast } from '@/hooks';
import { Header } from '@/components/ui-custom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { ScheduleItem } from '@radio/types';


const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

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

const SLOT_ACCENTS = [
  { dot: '#e8883a', glow: 'rgba(232,136,58,0.18)', label: 'bg-[#e8883a]' },
  { dot: '#4f98a3', glow: 'rgba(79,152,163,0.18)', label: 'bg-[#4f98a3]' },
  { dot: '#a86fdf', glow: 'rgba(168,111,223,0.18)', label: 'bg-[#a86fdf]' },
  { dot: '#6daa45', glow: 'rgba(109,170,69,0.18)',  label: 'bg-[#6daa45]' },
  { dot: '#dd6974', glow: 'rgba(221,105,116,0.18)', label: 'bg-[#dd6974]' },
  { dot: '#e8af34', glow: 'rgba(232,175,52,0.18)',  label: 'bg-[#e8af34]' },
];

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
  onClick,
}: {
  program: ScheduleItem;
  idx: number;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const accent = SLOT_ACCENTS[idx % SLOT_ACCENTS.length];

  const startD = new Date(program.start_timestamp * 1000);
  const endD   = new Date(program.end_timestamp   * 1000);
  const startTime = startD.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
  const endTime   = endD.toLocaleTimeString('es-CO',   { hour: '2-digit', minute: '2-digit', hour12: true });
  const isLive    = program.type === 'streamer';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -16 }}
      animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
      transition={{ duration: 0.5, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex gap-5 pl-14 pb-8 last:pb-0"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
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
        className="flex-1 rounded-2xl overflow-hidden border border-border bg-card text-card-foreground transition-colors duration-200 shadow-sm"
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
          <div className="hidden sm:block w-px self-stretch bg-border" />

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
              <span className="text-xs text-muted-foreground">
                {isLive ? 'Programa en vivo con locutor' : 'Programa automático'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
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

function SkeletonCard() {
  return (
    <div className="relative flex gap-5 pl-14 pb-8">
      <span className="absolute left-[14px] top-[18px] w-[18px] h-[18px] rounded-full bg-border" />
      <div className="flex-1 rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="h-3 w-24 rounded animate-pulse bg-muted" />
        <div className="h-4 w-48 rounded animate-pulse bg-muted" />
        <div className="h-3 w-32 rounded animate-pulse bg-secondary" />
      </div>
    </div>
  );
}

export function ProgramacionPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const { fetchSchedule } = useAzuraCast({});
  const [schedule, setSchedule]   = useState<ScheduleItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<ScheduleItem | null>(null);

  const currentDay = getBogotaDayOfWeek(new Date());
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
    .filter(item => getBogotaDayOfWeek(item.start_timestamp) === selectedDay)
    .sort((a, b) => a.start_timestamp - b.start_timestamp)
    .filter((item, index, self) =>
      index === self.findIndex(i => i.id === item.id && i.start_timestamp === item.start_timestamp)
    );

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
          className="flex gap-1 p-1.5 rounded-2xl mb-10 overflow-x-auto no-scrollbar bg-muted"
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
                <p className="text-xs mt-0.5 text-muted-foreground">
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
                {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
              </div>
            ) : programsForDay.length > 0 ? (
              <div className="relative">
                <TimelineLine count={programsForDay.length} />
                {programsForDay.map((program, idx) => (
                  <ProgramCard
                    key={`${program.id}-${program.start_timestamp}`}
                    program={program}
                    idx={idx}
                    onClick={() => setSelectedProgram(program)}
                  />
                ))}
              </div>
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
                  <h3 className="font-semibold text-[15px] mb-1">Programación continua</h3>
                  <p className="text-sm leading-relaxed max-w-[28ch] text-muted-foreground">
                    La radio transmite música continua este día. No hay eventos especiales agendados.
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
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 opacity-60" />
                    <span className="text-sm">
                      {new Date(selectedProgram.start_timestamp * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })} - {' '}
                      {new Date(selectedProgram.end_timestamp * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                  </div>
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