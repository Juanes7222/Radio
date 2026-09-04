import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  ExternalLink,
  Info,
  Disc3,
  Radio,
  Trash2,
  Volume2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { AdminSongRequest as SongRequest } from '@radio/types';

const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

function getRequestsErrorMessage(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 500) {
    return 'Las solicitudes no están habilitadas en esta estación o la clave API no tiene permisos suficientes.';
  }
  return 'No se pudo conectar con AzuraCast. Verifica la conexión e inténtalo de nuevo.';
}

// ---- helpers

function formatElapsed(ts: number): string {
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return 'ahora mismo';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

export default function AdminRequests() {
  const { getPendingRequests, approveRequest } = useAdminApi();
  const shouldReduceMotion = useReducedMotion();

  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getPendingRequests().then(
        (data): { ok: true; rows: SongRequest[] } => ({
          ok: true,
          rows: (data as { rows?: SongRequest[] })?.rows ?? [],
        }),
        (err): { ok: false; error: string } => ({
          ok: false,
          error: getRequestsErrorMessage(err),
        })
      );
      if (result.ok) {
        setRequests(result.rows);
        setError(null);
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  }, [getPendingRequests]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const handleDeny = async (id: string) => {
    setActionId(id);
    try {
      await approveRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setActionId(null);
    }
  };

  const oldest = requests.length > 0 ? Math.min(...requests.map((r) => r.timestamp)) : null;

  return (
    <div className="space-y-6">
      {/* ── Encabezado: consola ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
            Cabina · Cola de pedidos
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Solicitudes</h1>
          <p className="mt-1 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
            Lo que los oyentes piden ahora mismo. Descartar libera el siguiente turno en AzuraCast.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-1.5 transition-transform duration-150 ease-out-expo active:scale-[0.97]"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <a href={`${AZURACAST_URL}/station/1/reports/requests`} target="_blank" rel="noopener noreferrer">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground transition-transform duration-150 active:scale-[0.97]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              AzuraCast
            </Button>
          </a>
        </div>
      </div>

      {/* ── Tira de estado: VU + métricas ─────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-faint">En cola</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{requests.length}</span>
            <span className="text-xs text-muted-foreground">{requests.length === 1 ? 'pedido' : 'pedidos'}</span>
            {requests.length > 0 && (
              <span className="ml-auto flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-tally rounded-full bg-tally" aria-hidden />
                <span className="font-mono text-[10px] uppercase tracking-widest text-tally">Vivo</span>
              </span>
            )}
          </div>
          {/* VU bars decorativas */}
          <div className="mt-3 flex items-end gap-0.5">
            {Array.from({ length: 18 }).map((_, i) => {
              const active = i < Math.min(requests.length * 2 + 2, 18);
              return (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                    active ? 'bg-primary' : 'bg-border'
                  }`}
                  style={{ height: `${6 + (i % 3) * 3}px` }}
                />
              );
            })}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-faint">Espera más antigua</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium tabular-nums">
            <Clock className="h-3.5 w-3.5 text-faint" />
            {oldest ? formatElapsed(oldest) : '—'}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {oldest ? new Date(oldest * 1000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : 'Sin cola'}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-sunken px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-faint">Siguiente acción</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
            <Volume2 className="h-3.5 w-3.5 text-primary" />
            AzuraCast decide el orden
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Aprobar se hace en la cola de AzuraCast. Aquí descartas lo que no va al aire.</p>
        </div>
      </div>

      {/* ── Lista principal ─────────────────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10">
                <MessageSquare className="h-4 w-4 text-primary" />
              </span>
              Pendientes
              {requests.length > 0 && (
                <Badge variant="secondary" className="rounded-full bg-primary/10 px-2 py-0 font-mono text-xs tabular-nums text-primary">
                  {requests.length}
                </Badge>
              )}
            </CardTitle>
            {!loading && requests.length > 0 && (
              <span className="hidden font-mono text-xs text-faint sm:block">Desliza o descarta · Se actualiza cada 20s</span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {error ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-destructive/10">
                <XCircle className="h-5 w-5 text-destructive" />
              </span>
              <p className="mx-auto mt-3 max-w-[36ch] text-sm leading-relaxed text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-4 gap-2 active:scale-[0.97]">
                <RefreshCw className="h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          ) : loading && requests.length === 0 ? (
            <div className="space-y-2.5 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-xl border border-border bg-sunken p-3"
                  style={{ opacity: 1 - i * 0.18 }}
                >
                  <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-border" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-border" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-border" />
                  </div>
                </div>
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-sunken px-6 py-12 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-card ring-1 ring-border">
                <Radio className="h-5 w-5 text-faint" />
              </span>
              <p className="mt-4 text-sm font-medium">Cabina en silencio</p>
              <p className="mx-auto mt-1 max-w-[36ch] text-sm leading-relaxed text-muted-foreground">
                No hay solicitudes pendientes ahora. Cuando un oyente pida una canción, aparecerá aquí al instante.
              </p>
              <div className="mt-4 flex justify-center">
                <Badge variant="outline" className="gap-1.5 rounded-full font-mono text-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Escuchando AzuraCast
                </Badge>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <AnimatePresence initial={false} mode="popLayout">
                {requests.map((req, idx) => (
                  <motion.div
                    key={req.id}
                    layout={!shouldReduceMotion}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -6 }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0.15 }
                        : { type: 'spring', duration: 0.42, bounce: 0.12, delay: Math.min(idx * 0.04, 0.18) }
                    }
                    className="group relative overflow-hidden rounded-xl border border-border bg-sunken transition-colors hover:border-border hover:bg-card focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/20"
                  >
                    {/* Lomo tipo vinilo */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-[3px] bg-border transition-colors group-hover:bg-primary/60"
                    />
                    {/* Surcos decorativos vert. sutiles al hover */}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-[3px] w-px bg-[repeating-linear-gradient(to_bottom,transparent_0_3px,hsl(var(--border))_3px_4px)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    />

                    <div className="flex items-center gap-3 py-3 pl-4 pr-2 sm:gap-4 sm:pl-5 sm:pr-3">
                      {/* Carátula / disco */}
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-card ring-1 ring-border">
                        {req.song.art ? (
                          <img
                            src={req.song.art}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center">
                            <Disc3 className="h-5 w-5 text-faint" />
                          </span>
                        )}
                        {/* Brillo vinilo */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,hsl(var(--foreground)/0.08),transparent_55%)]"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold leading-tight tracking-tight">{req.song.title || 'Sin título'}</p>
                        <p className="truncate text-xs text-muted-foreground">{req.song.artist || 'Artista desconocido'}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 font-mono text-[11px] tabular-nums text-faint ring-1 ring-border">
                            <Clock className="h-3 w-3" />
                            {new Date(req.timestamp * 1000).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="hidden font-mono text-[11px] tabular-nums text-faint sm:inline">
                            · {formatElapsed(req.timestamp)}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleDeny(req.id)}
                          disabled={actionId === req.id}
                          aria-label={`Descartar ${req.song.title}`}
                          className="h-8 gap-1.5 rounded-full px-3 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 transition-[transform,background-color,color] duration-150 ease-out-expo active:scale-[0.97]"
                        >
                          {actionId === req.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">Descartar</span>
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Placa informativa ───────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-info/10">
          <Info className="h-4 w-4 text-info" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-tight">Cómo funciona la cola</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            AzuraCast reproduce las solicitudes aprobadas según la configuración de la playlist. Para habilitar o
            deshabilitar pedidos ve a{' '}
            <a
              href={`${AZURACAST_URL}/station/1/playlists`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
            >
              Playlists → Incluir en solicitudes
            </a>
            . Esta vista solo te deja descartar lo que no quieres que suene.
          </p>
        </div>
      </div>

      {/* Estado vacío técnico cuando no hay nada pero se quiere dar feedback táctil */}
      {requests.length === 0 && !loading && !error && (
        <p className="flex items-center justify-center gap-1.5 font-mono text-xs text-faint">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          Todo al día — la consola está al aire
        </p>
      )}
    </div>
  );
}
