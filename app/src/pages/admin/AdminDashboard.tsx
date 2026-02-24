import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Radio, Music, Wifi, RefreshCw, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useTheme } from '@/hooks';
import type { NowPlayingData } from '@/types/azuracast';
import type { ListenerDetail } from '@/types/admin';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  accent?: boolean;
}

function StatCard({ title, value, icon: Icon, description, accent }: StatCardProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {title}
            </p>
            <p className={`text-3xl font-bold mt-1 ${accent ? 'text-primary' : ''}`}>
              {value}
            </p>
            {description && (
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {description}
              </p>
            )}
          </div>
          <div className={`p-3 rounded-full ${accent ? 'bg-primary/10' : isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
            <Icon className={`w-5 h-5 ${accent ? 'text-primary' : isDark ? 'text-slate-300' : 'text-slate-600'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { getStatus, getListeners, getNowPlaying } = useAdminApi();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [listeners, setListeners] = useState<ListenerDetail[]>([]);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [npData, listData, status] = await Promise.allSettled([
        getNowPlaying(),
        getListeners(),
        getStatus(),
      ]);

      if (npData.status === 'fulfilled') setNowPlaying(npData.value as NowPlayingData);
      if (listData.status === 'fulfilled') setListeners(listData.value as ListenerDetail[]);
      if (status.status === 'fulfilled') {
        const s = status.value as { is_online?: boolean };
        setIsOnline(s?.is_online ?? false);
      }
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [getNowPlaying, getListeners, getStatus]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const song = nowPlaying?.now_playing?.song;
  const elapsed = nowPlaying?.now_playing?.elapsed ?? 0;
  const duration = nowPlaying?.now_playing?.duration ?? 0;
  const progress = duration > 0 ? Math.min((elapsed / duration) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Última actualización: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.0 }}>
          <StatCard
            title="Estado"
            value={isOnline === null ? '...' : isOnline ? 'En línea' : 'Offline'}
            icon={Wifi}
            accent={isOnline === true}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <StatCard
            title="Oyentes únicos"
            value={nowPlaying?.listeners?.unique ?? '—'}
            icon={Users}
            accent
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard
            title="Oyentes totales"
            value={nowPlaying?.listeners?.total ?? '—'}
            icon={Users}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <StatCard
            title="En vivo"
            value={nowPlaying?.live?.is_live ? 'Sí' : 'No'}
            icon={Radio}
            description={nowPlaying?.live?.streamer_name ?? undefined}
          />
        </motion.div>
      </div>

      {/* Now Playing */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Music className="w-4 h-4 text-primary" />
              Sonando ahora
            </CardTitle>
          </CardHeader>
          <CardContent>
            {song ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  {song.art && (
                    <img
                      src={song.art}
                      alt={song.title}
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-lg truncate">{song.title || 'Sin título'}</p>
                    <p className={`text-sm truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {song.artist || 'Artista desconocido'}
                    </p>
                    {nowPlaying?.now_playing?.is_request && (
                      <Badge variant="secondary" className="mt-1 text-xs">Solicitud</Badge>
                    )}
                  </div>
                </div>
                {/* Barra de progreso */}
                <div className="space-y-1">
                  <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-1000"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className={`flex justify-between text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    <span>{formatTime(elapsed)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>Sin información disponible</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Lista de oyentes conectados */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4 text-primary" />
                Oyentes conectados
                <Badge variant="secondary">{listeners.length}</Badge>
              </CardTitle>
              <a
                href="http://localhost/station/1/reports/listeners"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Ver más <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {listeners.length === 0 ? (
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                No hay oyentes conectados en este momento.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {listeners.map((l: ListenerDetail, i: number) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-2 rounded-lg text-sm ${
                      isDark ? 'bg-slate-900' : 'bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs truncate">{l.ip}</p>
                      <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {l.location?.city ? `${l.location.city}, ${l.location.country}` : l.mount_name}
                      </p>
                    </div>
                    <span className={`text-xs shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {formatDuration(l.connected_time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h${Math.floor((secs % 3600) / 60)}m`;
}
