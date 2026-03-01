import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, RefreshCw, Clock, Radio, ListMusic, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useTheme } from '@/hooks';
import type { ScheduleItem } from '@/types/admin';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

export default function AdminSchedule() {
  const { getSchedule } = useAdminApi();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'timeline'>('list');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSchedule();
      setSchedule(data as ScheduleItem[]);
    } finally {
      setLoading(false);
    }
  }, [getSchedule]);

  useEffect(() => { load(); }, [load]);

  const now = Date.now() / 1000;

  const upcoming = schedule.filter((s) => s.end_timestamp > now);
  const active = upcoming.filter((s) => s.start_timestamp <= now);
  const next = upcoming.filter((s) => s.start_timestamp > now).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Programación</h1>
          <p className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex rounded-lg p-1 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lista
            </button>
            <button
              onClick={() => setView('timeline')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === 'timeline'
                  ? 'bg-primary text-primary-foreground'
                  : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Línea de tiempo
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <a
            href={`${AZURACAST_URL}/station/1/playlists`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline" className="gap-2 text-xs">
              <ExternalLink className="w-3 h-3" />
              Editar en AzuraCast
            </Button>
          </a>
        </div>
      </div>

      {/* En curso ahora */}
      {active.length > 0 && (
        <div className="space-y-2">
          <h2 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            En curso ahora
          </h2>
          {active.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <Card className={`border-primary/50 ${isDark ? 'bg-slate-800/60' : ''}`}>
                <CardContent className="pt-4 pb-4">
                  <ScheduleRow item={item} isDark={isDark} isActive />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {view === 'list' ? (
        <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="w-4 h-4 text-primary" />
              Próximos eventos
              <Badge variant="secondary">{next.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && schedule.length === 0 ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={`h-14 rounded-lg animate-pulse ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`} />
                ))}
              </div>
            ) : next.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <CalendarDays className="w-10 h-10 mx-auto text-slate-400" />
                <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                  No hay eventos programados próximamente.
                </p>
                <a href="http://localhost/station/1/playlists" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-2 mt-2">
                    <ExternalLink className="w-3 h-3" />
                    Programar en AzuraCast
                  </Button>
                </a>
              </div>
            ) : (
              <div className="divide-y">
                {next.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="py-3 first:pt-0 last:pb-0"
                  >
                    <ScheduleRow item={item} isDark={isDark} />
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Vista línea de tiempo */
        <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
          <CardHeader>
            <CardTitle className="text-base">Hoy — {DAY_NAMES[new Date().getDay()]}</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <div className="min-w-[600px] relative">
              {/* Horas */}
              <div className="flex mb-1">
                <div className="w-20 shrink-0" />
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className={`flex-1 text-center text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                  >
                    {h.toString().padStart(2, '0')}
                  </div>
                ))}
              </div>
              {/* Línea de tiempo */}
              <div className="relative">
                <div
                  className={`relative h-12 rounded-lg overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-slate-100'}`}
                >
                  {next.concat(active).map((item) => {
                    const startDate = new Date(item.start_timestamp * 1000);
                    const endDate = new Date(item.end_timestamp * 1000);
                    const startH = startDate.getHours() + startDate.getMinutes() / 60;
                    const endH = endDate.getHours() + endDate.getMinutes() / 60;
                    const left = (startH / 24) * 100;
                    const width = Math.max(((endH - startH) / 24) * 100, 0.5);
                    return (
                      <div
                        key={item.id}
                        title={`${item.title} — ${item.start} → ${item.end}`}
                        className={`absolute top-1 bottom-1 rounded text-xs flex items-center px-1 overflow-hidden truncate ${
                          item.type === 'streamer'
                            ? 'bg-blue-500/80 text-white'
                            : 'bg-primary/80 text-primary-foreground'
                        }`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <span className="truncate">{item.title}</span>
                      </div>
                    );
                  })}
                  {/* Indicador de hora actual */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                    style={{
                      left: `${((new Date().getHours() + new Date().getMinutes() / 60) / 24) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary/80" />
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Playlist</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-blue-500/80" />
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Streamer</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-0.5 h-3 bg-red-500" />
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Ahora</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScheduleRow({ item, isDark, isActive }: { item: ScheduleItem; isDark: boolean; isActive?: boolean }) {
  const Icon = item.type === 'streamer' ? Radio : ListMusic;
  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${isActive ? 'bg-primary/10' : isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
        <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : isDark ? 'text-slate-300' : 'text-slate-600'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{item.title}</p>
          {isActive && <Badge variant="default" className="text-xs">En vivo</Badge>}
        </div>
        <div className={`flex items-center gap-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          <Clock className="w-3 h-3" />
          {item.start} → {item.end}
        </div>
      </div>
      <Badge variant="outline" className="text-xs shrink-0">
        {item.type === 'streamer' ? 'DJ' : 'Playlist'}
      </Badge>
    </div>
  );
}
