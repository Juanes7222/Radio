import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CalendarDays, RefreshCw, Clock, Radio, ListMusic, ExternalLink, CalendarRange, Timer, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';

type ScheduleView = 'list' | 'week';

interface ScheduleCategorySummary {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
}

interface ScheduleItem {
  id: string | number;
  title: string;
  start_timestamp: number;
  end_timestamp: number;
  start: string;
  end: string;
  type: string;
  category?: ScheduleCategorySummary | null;
  is_streamer?: boolean;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

function getBogotaDayOfWeek(date: Date | number): number {
  const ts = typeof date === 'number' ? date : Math.floor(date.getTime() / 1000);
  const d = new Date(ts * 1000);
  const utcDay = d.getUTCDay();
  const utcHours = d.getUTCHours();
  if (utcHours < 5) return (utcDay - 1 + 7) % 7;
  return utcDay;
}

function formatHourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export default function AdminSchedule() {
  const { getSchedule } = useAdminApi();
  const shouldReduceMotion = useReducedMotion();

  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ScheduleView>('list');
  const [now, setNow] = useState(() => Date.now() / 1000);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getSchedule();
      const rows = Array.isArray(data) ? (data as ScheduleItem[]) : [];
      setSchedule(rows);
      setNow(Date.now() / 1000);
    } catch {
      setError('No se pudo cargar la programación. Verifica que AzuraCast esté disponible.');
    } finally {
      setLoading(false);
    }
  }, [getSchedule]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
    const id = setInterval(() => setNow(Date.now() / 1000), 30000);
    return () => clearInterval(id);
  }, [load]);

  const { active, next, todayCount } = useMemo(() => {
    const upcoming = schedule.filter((s) => s.end_timestamp > now);
    const act = upcoming.filter((s) => s.start_timestamp <= now);
    const nxt = upcoming.filter((s) => s.start_timestamp > now).slice(0, 12);
    const todayDow = getBogotaDayOfWeek(new Date());
    const todayItems = schedule.filter((s) => getBogotaDayOfWeek(new Date(s.start_timestamp * 1000)) === todayDow);
    return { active: act, next: nxt, todayCount: todayItems.length };
  }, [schedule, now]);

  // Datos para grilla semanal: agrupar por día
  const weekItems = useMemo(() => schedule, [schedule]);

  return (
    <div className="space-y-6">
      {/* Header — consola de parrilla */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-[50px]" />
        <div aria-hidden className="pointer-events-none absolute -left-16 -bottom-20 h-44 w-44 rounded-full bg-info/10 blur-[40px]" />
        <div className="relative p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">Parrilla · AzuraCast</p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Programación</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm leading-relaxed text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-faint" />
                  {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <span className="hidden h-1 w-1 rounded-full bg-border sm:block" aria-hidden />
                <span className="font-mono text-xs tabular-nums text-faint">Bogotá UTC-5</span>
                {active.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-tally px-2 py-0.5 font-mono text-xs font-medium text-white">
                    <span className="h-1.5 w-1.5 animate-tally rounded-full bg-white" aria-hidden /> Al aire · {active[0].title}
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border bg-sunken p-1">
                <button
                  onClick={() => setView('list')}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-[0.97] ${view === 'list' ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Lista
                </button>
                <button
                  onClick={() => setView('week')}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all active:scale-[0.97] ${view === 'week' ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Semana
                </button>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-1.5 rounded-full border-border bg-card active:scale-[0.97]">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
              </Button>
              <a href={`${AZURACAST_URL}/station/1/playlists`} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="gap-1.5 rounded-full border-border bg-card text-xs active:scale-[0.97]">
                  <ExternalLink className="h-3.5 w-3.5" /> AzuraCast
                </Button>
              </a>
            </div>
          </div>

          {/* Tira de métricas sutil */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-sunken px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">En curso ahora</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                <span className={`h-2 w-2 rounded-full ${active.length ? 'bg-tally animate-pulse' : 'bg-faint'}`} aria-hidden />
                {active.length ? `${active.length} programa${active.length > 1 ? 's' : ''}` : 'Nada al aire'}
              </p>
              <p className="mt-0.5 font-mono text-xs tabular-nums text-faint">{active.length ? active.map((a) => a.title).join(' · ') : 'La automatización sigue'}</p>
            </div>
            <div className="rounded-xl border border-border bg-sunken px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Hoy</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{todayCount} bloques</p>
              <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-faint"><Timer className="h-3 w-3" /> {DAY_FULL[getBogotaDayOfWeek(new Date())]}</p>
            </div>
            <div className="rounded-xl border border-border bg-sunken px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Semana</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{schedule.length} bloques</p>
              <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-faint"><CalendarRange className="h-3 w-3" /> Lun—Dom</p>
            </div>
          </div>
        </div>
      </div>

      {/* En curso */}
      <AnimatePresence>
        {active.length > 0 && (
          <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-faint">En curso ahora</h2>
            {active.map((item) => (
              <Card key={item.id} className="overflow-hidden border-primary/30 bg-card shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_8px_24px_hsl(var(--primary)/0.08)]">
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    <span className="w-1 shrink-0 bg-primary" aria-hidden />
                    <div className="flex-1 p-4">
                      <ScheduleRow item={item} isActive now={now} />
                    </div>
                    <span className="hidden items-center gap-1.5 self-center rounded-full bg-primary px-3 py-1 font-mono text-xs font-semibold text-primary-foreground sm:inline-flex">
                      <span className="h-1.5 w-1.5 animate-tally rounded-full bg-white" aria-hidden /> En vivo
                    </span>
                    <span className="w-4 shrink-0" aria-hidden />
                  </div>
                </CardContent>
              </Card>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contenido principal */}
      {view === 'list' ? (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-sunken/40 px-4 py-3 sm:px-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10"><CalendarDays className="h-4 w-4 text-primary" /></span>
              Próximos eventos <Badge variant="outline" className="rounded-full border-border bg-card font-mono text-xs tabular-nums">{next.length}</Badge>
            </h2>
            <span className="hidden font-mono text-xs text-faint sm:block">Se actualiza cada 30s</span>
          </div>
          <CardContent className="p-0">
            {loading && schedule.length === 0 ? (
              <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-sunken" style={{ opacity: 1 - i * 0.12 }} />)}</div>
            ) : error ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-3 rounded-full gap-1.5 active:scale-[0.97]"><RefreshCw className="h-3.5 w-3.5" />Reintentar</Button>
              </div>
            ) : next.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sunken ring-1 ring-border"><Sparkles className="h-5 w-5 text-faint" /></span>
                <p className="mt-3 text-sm font-medium">Sin eventos próximos en la ventana de 7 días</p>
                <p className="mx-auto mt-1 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">La parrilla viene de AzuraCast. Si está vacía, revisa que las playlists tengan horarios asignados y que las categorías no estén ocultas.</p>
                <a href={`${AZURACAST_URL}/station/1/playlists`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="mt-4 gap-1.5 rounded-full active:scale-[0.97]"><ExternalLink className="h-3.5 w-3.5" />Programar en AzuraCast</Button>
                </a>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {next.map((item, i) => (
                  <motion.div key={item.id} initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={shouldReduceMotion ? { duration: 0.12 } : { delay: Math.min(i * 0.03, 0.18), duration: 0.24, ease: [0.23, 1, 0.32, 1] as const }} className="p-4 sm:px-5">
                    <ScheduleRow item={item} now={now} />
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-sunken/40 px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold tracking-tight">Semana · {DAY_FULL[getBogotaDayOfWeek(new Date())]} es hoy</h2>
            <span className="flex items-center gap-3 font-mono text-xs text-faint">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-primary" aria-hidden /> Playlist</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-info" aria-hidden /> Locutor</span>
              <span className="inline-flex items-center gap-1"><span className="h-3 w-0.5 bg-tally" aria-hidden /> Ahora</span>
            </span>
          </div>
          <CardContent className="p-0">
            {loading && schedule.length === 0 ? (
              <div className="p-4"><div className="h-64 animate-pulse rounded-xl bg-sunken" /></div>
            ) : error ? (
              <div className="px-6 py-12 text-center"><p className="text-sm text-muted-foreground">{error}</p></div>
            ) : weekItems.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-faint">No hay bloques programados esta semana.</p>
                <p className="mt-1 text-xs text-faint">Crea horarios en AzuraCast → Playlists → Editar → Programación.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[760px] p-3 sm:p-4">
                  {/* Cabecera días */}
                  <div className="mb-2 grid grid-cols-[52px_repeat(7,1fr)] gap-1">
                    <span className="font-mono text-[11px] uppercase tracking-widest text-faint">Hora</span>
                    {DAY_NAMES.map((d, idx) => {
                      const isToday = idx === getBogotaDayOfWeek(new Date());
                      return (
                        <span key={d} className={`rounded-full px-2 py-1 text-center font-mono text-xs ${isToday ? 'bg-primary text-primary-foreground font-semibold' : 'text-faint'}`}>{d}</span>
                      );
                    })}
                  </div>
                  {/* Grilla */}
                  <div className="relative overflow-hidden rounded-xl border border-border bg-sunken">
                    {/* líneas horarias */}
                    <div className="grid grid-cols-[52px_repeat(7,1fr)]">
                      <div className="divide-y divide-border/50">
                        {HOURS.map((h) => (
                          <div key={h} className="h-8 border-r border-border/50 pr-2 text-right font-mono text-[10px] tabular-nums text-faint">{h % 2 === 0 ? formatHourLabel(h) : ''}</div>
                        ))}
                      </div>
                      {DAY_NAMES.map((_, dayIdx) => (
                        <div key={dayIdx} className="relative divide-y divide-border/30 border-l border-border/30">
                          {HOURS.map((h) => (
                            <div key={h} className="h-8" />
                          ))}
                          {/* Bloques del día */}
                          {weekItems
                            .filter((it) => getBogotaDayOfWeek(new Date(it.start_timestamp * 1000)) === dayIdx)
                            .map((item) => {
                              const start = new Date(item.start_timestamp * 1000);
                              const end = new Date(item.end_timestamp * 1000);
                              const startDec = start.getHours() + start.getMinutes() / 60;
                              const endDec = end.getHours() + end.getMinutes() / 60 + (end.getDate() !== start.getDate() ? 24 - startDec : 0);
                              const top = (startDec / 24) * (24 * 32);
                              const height = Math.max(((endDec - startDec) / 24) * (24 * 32), 14);
                              const catColor = item.category?.color;
                              const bg = catColor ? catColor : item.type === 'streamer' || item.is_streamer ? 'hsl(var(--info))' : 'hsl(var(--primary))';
                              const isNow = item.start_timestamp <= now && item.end_timestamp > now;
                              return (
                                <div
                                  key={item.id}
                                  title={`${item.title} — ${item.start} → ${item.end}`}
                                  className="absolute left-1 right-1 overflow-hidden rounded-md px-1.5 py-1 text-[11px] font-medium leading-tight shadow-sm ring-1 ring-black/10"
                                  style={{ top, height, background: bg, color: 'white' }}
                                >
                                  <span className="line-clamp-2 break-words">{item.title}</span>
                                  {isNow && <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />}
                                </div>
                              );
                            })}
                          {/* línea ahora si es hoy */}
                          {dayIdx === getBogotaDayOfWeek(new Date()) && (
                            <div
                              className="pointer-events-none absolute left-0 right-0 h-0.5 bg-tally shadow-[0_0_8px_hsl(var(--tally)/0.6)]"
                              style={{ top: `${((new Date().getHours() + new Date().getMinutes() / 60) / 24) * (24 * 32)}px` }}
                              aria-hidden
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 font-mono text-xs text-faint">Cada bloque toma su color de la categoría (Tipos de programa). Sin categoría usa ámbar/azul según tipo.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScheduleRow({ item, isActive, now }: { item: ScheduleItem; isActive?: boolean; now?: number }) {
  const Icon = item.type === 'streamer' || item.is_streamer ? Radio : ListMusic;
  const cat = item.category;
  const accent = cat?.color ?? (item.type === 'streamer' || item.is_streamer ? 'hsl(var(--info))' : undefined);
  const isNow = now !== undefined && item.start_timestamp <= now && item.end_timestamp > now;
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1" style={{ background: accent ? `${accent}18` : isActive ? 'hsl(var(--primary) / 0.10)' : 'hsl(var(--muted))', color: accent ?? (isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'), borderColor: accent ? `${accent}30` : 'hsl(var(--border))' }}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold tracking-tight">{item.title}</p>
          {isNow && <Badge className="rounded-full bg-tally px-2 py-0 text-xs font-semibold text-white">En vivo</Badge>}
          {cat && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium" style={{ background: `${cat.color}14`, color: cat.color, borderColor: `${cat.color}25` }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} aria-hidden />
              {cat.name}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-faint">
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{item.start} → {item.end}</span>
          <span className="hidden h-1 w-1 rounded-full bg-border sm:block" aria-hidden />
          <span className="capitalize">{DAY_FULL[getBogotaDayOfWeek(new Date(item.start_timestamp * 1000))]}</span>
        </div>
      </div>
      <Badge variant="outline" className="hidden shrink-0 rounded-full border-border bg-card font-mono text-xs sm:inline-flex">
        {item.type === 'streamer' || item.is_streamer ? 'DJ' : 'Playlist'}
      </Badge>
      {isActive && <span className="hidden h-2 w-2 animate-pulse rounded-full bg-tally sm:block" aria-hidden />}
    </div>
  );
}
