import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Radio, Music, Wifi, RefreshCw, ExternalLink, SkipForward, RotateCcw, Eye, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatClock, formatDateTimeFull, formatDuration } from '@/lib/format';
import type { NowPlayingData, ListenerDetail, ListenerHistoryPoint } from '@radio/types';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  accent?: boolean;
}

function StatCard({ title, value, icon: Icon, description, accent }: StatCardProps) {
  return (
    <Card className="border-slate-700 bg-slate-800/60">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-400">
              {title}
            </p>
            <p className={`text-3xl font-bold mt-1 ${accent ? 'text-primary' : ''}`}>
              {value}
            </p>
            {description && (
              <p className="text-xs mt-1 text-slate-500">
                {description}
              </p>
            )}
          </div>
          <div className={`p-3 rounded-full ${accent ? 'bg-primary/10' : 'bg-slate-700'}`}>
            <Icon className={`w-5 h-5 ${accent ? 'text-primary' : 'text-slate-300'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ListenerDetailDialog({
  listener,
  onClose,
}: {
  listener: ListenerDetail | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={listener !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Oyente conectado</DialogTitle>
          <DialogDescription>Detalles de la conexión al stream.</DialogDescription>
        </DialogHeader>
        {listener && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-slate-900 border border-slate-700 divide-y divide-slate-700/60">
              <DetailRow label="Dirección IP" value={listener.ip} monospace />
              <DetailRow
                label="Ubicación"
                value={listener.location?.city
                  ? `${listener.location.city}, ${listener.location.country}`
                  : listener.mount_name}
              />
              {listener.location?.lat !== null && listener.location?.lon !== null && (
                <DetailRow
                  label="Coordenadas"
                  value={`${listener.location?.lat}, ${listener.location?.lon}`}
                  monospace
                />
              )}
              <DetailRow label="Mount point" value={listener.mount_name} monospace />
              <DetailRow
                label="Conectado hace"
                value={`${formatDuration(listener.connected_time)} · ${formatDateTimeFull(listener.connected_on * 1000)}`}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 mb-1">User agent</p>
              <p className="text-xs text-slate-300 break-words bg-slate-900 border border-slate-700 rounded-lg p-3">
                {listener.user_agent || '—'}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value, monospace = false }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="text-xs shrink-0 text-slate-400">{label}</span>
      <span className={`text-xs text-right break-all ${monospace ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

const LISTENER_CHART_CONFIG = {
  current: { label: 'Oyentes ahora', color: 'hsl(var(--primary))' },
  unique: { label: 'Únicos (24h)', color: 'hsl(199 89% 48%)' },
} satisfies ChartConfig;

export default function AdminDashboard() {
  const { getStatus, getListeners, getNowPlaying, getListenerHistory, skipCurrentTrack, restartStation } = useAdminApi();

  const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
  const [listeners, setListeners] = useState<ListenerDetail[]>([]);
  const [history, setHistory] = useState<ListenerHistoryPoint[]>([]);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [skipLoading, setSkipLoading] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [confirmAction, setConfirmAction] = useState<'skip' | 'restart' | null>(null);
  const [selectedListener, setSelectedListener] = useState<ListenerDetail | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [npData, listData, status, historyRes] = await Promise.allSettled([
        getNowPlaying(),
        getListeners(),
        getStatus(),
        getListenerHistory(24),
      ]);

      if (npData.status === 'fulfilled') setNowPlaying(npData.value as NowPlayingData);
      if (listData.status === 'fulfilled') setListeners(listData.value as ListenerDetail[]);
      if (status.status === 'fulfilled') {
        const s = status.value as { is_online?: boolean };
        setIsOnline(s?.is_online ?? false);
      }
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value.rows);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [getNowPlaying, getListeners, getStatus, getListenerHistory]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleConfirmAction = useCallback(async () => {
    if (confirmAction === 'skip') {
      setSkipLoading(true);
      try { await skipCurrentTrack(); await loadData(); } finally { setSkipLoading(false); }
    } else if (confirmAction === 'restart') {
      setRestartLoading(true);
      try { await restartStation(); await loadData(); } finally { setRestartLoading(false); }
    }
    setConfirmAction(null);
  }, [confirmAction, skipCurrentTrack, restartStation, loadData]);

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
          <p className="text-sm mt-0.5 text-slate-400">
            Última actualización: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAction('skip')}
            disabled={loading || skipLoading}
            className="gap-1.5"
            title="Saltar canción actual"
          >
            <SkipForward className={`w-4 h-4 ${skipLoading ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">Saltar</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAction('restart')}
            disabled={loading || restartLoading}
            className="gap-1.5 text-orange-500 border-orange-500/40 hover:bg-orange-500/10"
            title="Reiniciar la estación (desconecta oyentes momentáneamente)"
          >
            <RotateCcw className={`w-4 h-4 ${restartLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Reiniciar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
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
        <Card className="border-slate-700 bg-slate-800/60">
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
                    <p className="text-sm truncate text-slate-400">
                      {song.artist || 'Artista desconocido'}
                    </p>
                    {nowPlaying?.now_playing?.is_request && (
                      <Badge variant="secondary" className="mt-1 text-xs">Solicitud</Badge>
                    )}
                  </div>
                </div>
                {/* Barra de progreso */}
                <div className="space-y-1">
                  <div className="w-full h-1.5 rounded-full bg-slate-700">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-1000"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{formatClock(elapsed)}</span>
                    <span>{formatClock(duration)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-slate-400">Sin información disponible</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Gráfica de oyentes */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="border-slate-700 bg-slate-800/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-4 h-4 text-primary" />
              Oyentes en las últimas 24 horas
              {history.length > 0 && <Badge variant="secondary">{history.length} muestras</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="py-10 text-center space-y-1">
                <p className="text-sm text-slate-400">Aún no hay datos de historial.</p>
                <p className="text-xs text-slate-500">
                  Se toma una muestra cada 5 minutos; la gráfica se poblará automáticamente.
                </p>
              </div>
            ) : (
              <ChartContainer config={LISTENER_CHART_CONFIG} className="aspect-auto h-72 w-full">
                <AreaChart data={history} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="recordedAt"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(value: string) =>
                      new Date(value).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
                    }
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        labelFormatter={(label) =>
                          new Date(String(label)).toLocaleString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        }
                      />
                    }
                  />
                  <Area
                    dataKey="unique"
                    type="monotone"
                    fill="var(--color-unique)"
                    fillOpacity={0.12}
                    stroke="var(--color-unique)"
                    strokeWidth={2}
                  />
                  <Area
                    dataKey="current"
                    type="monotone"
                    fill="var(--color-current)"
                    fillOpacity={0.18}
                    stroke="var(--color-current)"
                    strokeWidth={2}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Lista de oyentes conectados */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="border-slate-700 bg-slate-800/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-4 h-4 text-primary" />
                Oyentes conectados
                <Badge variant="secondary">{listeners.length}</Badge>
              </CardTitle>
              <a
                href={`${AZURACAST_URL}/station/1/reports/listeners`}
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
              <p className="text-sm text-slate-400">
                No hay oyentes conectados en este momento.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {listeners.map((l: ListenerDetail, i: number) => (
                  <button
                    key={i}
                    onClick={() => setSelectedListener(l)}
                    className="w-full flex items-center justify-between p-2 rounded-lg text-sm bg-slate-900 hover:bg-slate-800 transition-colors text-left group"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-xs truncate">{l.ip}</p>
                      <p className="text-xs truncate text-slate-400">
                        {l.location?.city ? `${l.location.city}, ${l.location.country}` : l.mount_name}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 shrink-0 text-slate-400">
                      {formatDuration(l.connected_time)}
                      <Eye className="w-3.5 h-3.5 text-slate-600 group-hover:text-primary transition-colors" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Confirmaciones de acciones */}
      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction === 'skip' ? '¿Saltar la canción actual?' : '¿Reiniciar la estación?'}
        description={
          confirmAction === 'restart'
            ? 'Los oyentes serán desconectados momentáneamente. El reinicio puede tardar unos segundos.'
            : 'Se reproducirá la siguiente canción de la cola.'
        }
        confirmLabel={confirmAction === 'skip' ? 'Saltar' : 'Reiniciar'}
        loading={skipLoading || restartLoading}
        onConfirm={() => void handleConfirmAction()}
      />

      {/* Detalle de oyente */}
      <ListenerDetailDialog listener={selectedListener} onClose={() => setSelectedListener(null)} />
    </div>
  );
}
