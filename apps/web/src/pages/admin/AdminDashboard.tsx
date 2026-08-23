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
import { useStationStatus } from '@/hooks/useStationStatus';
import { formatClock, formatDateTimeFull, formatDuration } from '@/lib/format';
import type { ListenerDetail, ListenerHistoryPoint } from '@radio/types';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  tone?: StatTone;
}

type StatTone = 'default' | 'primary' | 'live';

const STAT_TONE_CLASSES: Record<StatTone, { value: string; chip: string; icon: string }> = {
  default: { value: '', chip: 'bg-sunken', icon: 'text-muted-foreground' },
  primary: { value: 'text-primary', chip: 'bg-primary/10', icon: 'text-primary' },
  live: { value: 'text-tally', chip: 'bg-tally/10', icon: 'text-tally' },
};

function StatCard({ title, value, icon: Icon, description, tone = 'default' }: StatCardProps) {
  const classes = STAT_TONE_CLASSES[tone];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`mt-1 text-3xl font-bold ${classes.value}`}>{value}</p>
            {description && <p className="mt-1 text-xs text-faint">{description}</p>}
          </div>
          <div className={`rounded-md p-2.5 ${classes.chip}`}>
            <Icon className={`h-5 w-5 ${classes.icon}`} />
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
            <div className="divide-y divide-border rounded-lg border border-border bg-sunken">
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
              <p className="mb-1 text-xs font-medium text-muted-foreground">User agent</p>
              <p className="break-words rounded-lg border border-border bg-sunken p-3 text-xs text-foreground/90">
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
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={`break-all text-right text-xs ${monospace ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

const LISTENER_CHART_CONFIG = {
  current: { label: 'Oyentes ahora', color: 'hsl(var(--primary))' },
  unique: { label: 'Únicos (24h)', color: 'hsl(var(--info))' },
} satisfies ChartConfig;

export default function AdminDashboard() {
  const { getStatus, getListeners, getListenerHistory, skipCurrentTrack, restartStation } = useAdminApi();
  const {
    nowPlaying,
    loading: nowPlayingLoading,
    refresh: refreshNowPlaying,
  } = useStationStatus();

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
      const [listData, status, historyRes] = await Promise.allSettled([
        getListeners(),
        getStatus(),
        getListenerHistory(24),
      ]);

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
  }, [getListeners, getStatus, getListenerHistory]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    void refreshNowPlaying();
    void loadData();
  }, [loadData, refreshNowPlaying]);

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
          <p className="mt-0.5 text-sm text-muted-foreground">
            Última actualización:{' '}
            <span className="font-mono tabular-nums">{lastRefresh.toLocaleTimeString()}</span>
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
            <SkipForward className={`h-4 w-4 ${skipLoading ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">Saltar</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmAction('restart')}
            disabled={loading || restartLoading}
            className="gap-1.5 text-warning border-warning/40 hover:bg-warning/10"
            title="Reiniciar la estación (desconecta oyentes momentáneamente)"
          >
            <RotateCcw className={`h-4 w-4 ${restartLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Reiniciar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.0 }}>
          <StatCard
            title="Estado"
            value={isOnline === null ? '...' : isOnline ? 'En línea' : 'Offline'}
            icon={Wifi}
            tone={isOnline === true ? 'primary' : 'default'}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <StatCard
            title="Oyentes únicos"
            value={nowPlaying?.listeners?.unique ?? '—'}
            icon={Users}
            tone="primary"
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
            value={nowPlaying?.live?.is_live ? 'Al aire' : 'No'}
            icon={Radio}
            description={nowPlaying?.live?.streamer_name ?? undefined}
            tone={nowPlaying?.live?.is_live ? 'live' : 'default'}
          />
        </motion.div>
      </div>

      {/* Now Playing */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Music className="h-4 w-4 text-primary" />
              Sonando ahora
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!nowPlaying && nowPlayingLoading ? (
              <div className="h-16 animate-pulse rounded-md bg-sunken" />
            ) : song ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  {song.art && (
                    <img
                      src={song.art}
                      alt={song.title}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{song.title || 'Sin título'}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {song.artist || 'Artista desconocido'}
                    </p>
                    {nowPlaying?.now_playing?.is_request && (
                      <Badge variant="secondary" className="mt-1 text-xs">Solicitud</Badge>
                    )}
                  </div>
                </div>
                {/* Barra de progreso */}
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-1000"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between font-mono text-xs tabular-nums text-faint">
                    <span>{formatClock(elapsed)}</span>
                    <span>{formatClock(duration)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Sin información disponible</p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Gráfica de oyentes */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Oyentes en las últimas 24 horas
              {history.length > 0 && <Badge variant="secondary">{history.length} muestras</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="space-y-1 py-10 text-center">
                <p className="text-sm text-muted-foreground">Aún no hay datos de historial.</p>
                <p className="text-xs text-faint">
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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Oyentes conectados
                <Badge variant="secondary">{listeners.length}</Badge>
              </CardTitle>
              <a
                href={`${AZURACAST_URL}/station/1/reports/listeners`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Ver más <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {listeners.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay oyentes conectados en este momento.
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {listeners.map((l: ListenerDetail, i: number) => (
                  <button
                    key={i}
                    onClick={() => setSelectedListener(l)}
                    className="group w-full rounded-lg bg-sunken p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{l.ip}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {l.location?.city ? `${l.location.city}, ${l.location.country}` : l.mount_name}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                        {formatDuration(l.connected_time)}
                        <Eye className="h-3.5 w-3.5 text-faint transition-colors group-hover:text-primary" />
                      </span>
                    </div>
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
