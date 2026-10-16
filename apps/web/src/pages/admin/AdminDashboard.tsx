import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Radio, Music, Wifi, RefreshCw, SkipForward, RotateCcw, TrendingUp } from 'lucide-react';
import { Faceplate, FaceplateReading } from '@/components/admin/Faceplate';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import StatCard from '@/components/admin/StatCard';
import FacebookLiveControl from '@/components/admin/FacebookLiveControl';
import ConnectedListenersCard from '@/components/admin/ConnectedListenersCard';
import ListenerDetailDialog from '@/components/admin/ListenerDetailDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useStationStatus } from '@/hooks/useStationStatus';
import { formatClock } from '@/lib/format';
import { resolveArtworkUrl } from '@/lib/artwork';
import type { ListenerDetail, ListenerHistoryPoint } from '@radio/types';

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
  const dashboardArt = resolveArtworkUrl(song?.art);
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

      {/* The panel's faceplate: the broadcast state at top-bar scale, with
          the on-air voice as the verdict color carrier. The four-box stat
          row it replaces made the operator assemble the headline from four
          numbers of equal weight. */}
      <Faceplate
        lamp={
          isOnline === null
            ? 'bg-faint/40'
            : isOnline && nowPlaying?.live?.is_live
              ? 'bg-tally animate-tally'
              : isOnline
                ? 'bg-success'
                : 'bg-destructive'
        }
        label="Estado de la señal"
        verdict={
          <span
            className={
              isOnline === null
                ? 'text-muted-foreground'
                : isOnline
                  ? nowPlaying?.live?.is_live
                    ? 'text-tally'
                    : 'text-foreground'
                  : 'text-destructive'
            }
          >
            {isOnline === null
              ? 'Consultando...'
              : isOnline
                ? nowPlaying?.live?.is_live
                  ? `En vivo con ${nowPlaying?.live?.streamer_name ?? 'un streamer'}`
                  : 'Automatización en línea'
                : 'Estación fuera de línea'}
          </span>
        }
        slots={[
          <FaceplateReading key="song" label="Sonando">
            <span className="max-w-[14rem] truncate" title={song?.title ?? undefined}>
              {song?.title ?? '—'}
            </span>
          </FaceplateReading>,
          <FaceplateReading key="listeners" label="Oyentes">
            {nowPlaying?.listeners?.total ?? '—'}
          </FaceplateReading>,
          <FaceplateReading key="unique" label="Únicos 24h">
            {nowPlaying?.listeners?.unique ?? '—'}
          </FaceplateReading>,
        ]}
      />

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

      {/* Control Facebook Live */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
        <FacebookLiveControl />
      </motion.div>

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
                  const dashboardArt = resolveArtworkUrl(song.art);
                  {dashboardArt && (
                    <img
                      src={dashboardArt}
                      alt={song.title}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover bg-sunken"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
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
        <ConnectedListenersCard listeners={listeners} onSelectListener={setSelectedListener} />
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
