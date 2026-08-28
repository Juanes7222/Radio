import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Heart,
  CheckCircle2,
  RefreshCw,
  Clock,
  Save,
  MailOpen,
  Pencil,
  Search,
  Trash2,
  Sparkles,
  Quote,
  ArrowUpRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AdminPagination } from '@/components/ui-custom/AdminPagination';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { usePrayerEvents } from '@/hooks/usePrayerEvents';
import { timeAgo } from '@/lib/format';
import { PRAYER_STATUS, type PrayerRequest, type PrayerStatus, type PrayerStatusCounts } from '@radio/types';

const STATUSES = Object.values(PRAYER_STATUS);

const STATUS_META: Record<PrayerStatus, { label: string; chip: string; dot: string }> = {
  PENDIENTE: { label: 'Pendiente', chip: 'bg-warning/10 text-warning border-warning/20', dot: 'bg-warning' },
  EN_REVISION: { label: 'En revisión', chip: 'bg-info/10 text-info border-info/20', dot: 'bg-info' },
  RESPONDIDA: { label: 'Respondida', chip: 'bg-success/10 text-success border-success/20', dot: 'bg-success' },
  CERRADA: { label: 'Cerrada', chip: 'bg-muted text-muted-foreground border-border', dot: 'bg-faint' },
};

type EstadoFilter = PrayerStatus | 'all';
const PAGE_SIZE = 20;
const EMPTY_SELECTION: ReadonlySet<string> = new Set<string>();

export default function AdminPrayerRequests() {
  const {
    getPrayerRequests,
    updatePrayerRequest,
    markPrayerRequestRead,
    deletePrayerRequest,
    bulkMarkPrayerRequestsRead,
    bulkUpdatePrayerRequestStatus,
    bulkDeletePrayerRequests,
  } = useAdminApi();
  const shouldReduceMotion = useReducedMotion();

  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [counts, setCounts] = useState<PrayerStatusCounts | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PrayerRequest | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<PrayerStatus | ''>('');
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

  const viewKey = `${page}|${estadoFilter}|${search}`;
  const selectedIds = selection.key === viewKey ? selection.ids : EMPTY_SELECTION;
  const updateSelection = (ids: Set<string>) => setSelection({ key: viewKey, ids });

  const [editingRequest, setEditingRequest] = useState<PrayerRequest | null>(null);
  const [formName, setFormName] = useState('');
  const [formRequest, setFormRequest] = useState('');
  const [formEstado, setFormEstado] = useState<PrayerStatus>('PENDIENTE');
  const [formRespuesta, setFormRespuesta] = useState('');
  const [saving, setSaving] = useState(false);

  const appliedSearchRef = useRef('');

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      if (next !== appliedSearchRef.current) {
        appliedSearchRef.current = next;
        setSearch(next);
        setPage(1);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    () =>
      getPrayerRequests({
        page,
        limit: PAGE_SIZE,
        estado: estadoFilter === 'all' ? undefined : estadoFilter,
        search: search || undefined,
      })
        .then((data) => {
          setRequests(data.rows);
          setTotal(data.total);
          setTotalPages(data.totalPages);
          setCounts(data.counts);
          setUnreadCount(data.unreadCount);
          setError(null);
          setNow(Date.now());
        })
        .catch(() => setError('No se pudieron cargar las peticiones. Inténtalo de nuevo.'))
        .finally(() => setLoading(false)),
    [getPrayerRequests, page, estadoFilter, search]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  usePrayerEvents((event) => {
    void load();
    toast('Nueva petición de oración', { description: `Enviada por ${event.name}` });
  });

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  const handleQuickStatus = async (id: string, estado: PrayerStatus) => {
    setBusyId(id);
    try {
      await updatePrayerRequest(id, { estado });
      await load();
    } catch {
      setError('Error al cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkRead = async (id: string) => {
    setBusyId(id);
    try {
      await markPrayerRequestRead(id);
      await load();
    } catch {
      setError('Error al marcar como leída.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (reqId: string) => {
    setPendingDelete(null);
    setBusyId(reqId);
    try {
      await deletePrayerRequest(reqId);
      if (requests.length === 1 && page > 1) setPage((p) => p - 1);
      else await load();
    } catch {
      setError('Error al eliminar la petición.');
    } finally {
      setBusyId(null);
    }
  };

  const openEditor = (req: PrayerRequest) => {
    setEditingRequest(req);
    setFormName(req.name);
    setFormRequest(req.request);
    setFormEstado(req.estado);
    setFormRespuesta(req.respuesta ?? '');
  };

  const toggleSelected = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateSelection(next);
  };

  const allOnPageSelected = requests.length > 0 && requests.every((req) => selectedIds.has(req.id));
  const toggleSelectAll = () => updateSelection(allOnPageSelected ? new Set() : new Set(requests.map((r) => r.id)));

  const runBulk = async (action: () => Promise<string>) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const message = await action();
      toast.success(message);
      updateSelection(new Set());
      setBulkStatusValue('');
      await load();
    } catch {
      toast.error('No se pudo actualizar la selección. Inténtalo de nuevo.');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkRead = () =>
    runBulk(async () => {
      const { count } = await bulkMarkPrayerRequestsRead([...selectedIds]);
      return `${count} petición${count === 1 ? '' : 'es'} marcada${count === 1 ? '' : 's'} como leída`;
    });
  const handleBulkStatus = (estado: PrayerStatus) =>
    runBulk(async () => {
      const { count } = await bulkUpdatePrayerRequestStatus([...selectedIds], estado);
      return `Estado actualizado en ${count} petición${count === 1 ? '' : 'es'}`;
    });
  const handleBulkDelete = () =>
    runBulk(async () => {
      const ids = [...selectedIds];
      const { count } = await bulkDeletePrayerRequests(ids);
      if (requests.length === ids.length && page > 1) setPage((p) => p - 1);
      return `${count} petición${count === 1 ? '' : 'es'} eliminada${count === 1 ? '' : 's'}`;
    });

  const handleSaveEdit = async () => {
    if (!editingRequest || !formName.trim() || !formRequest.trim()) return;
    setSaving(true);
    try {
      await updatePrayerRequest(editingRequest.id, {
        name: formName.trim(),
        request: formRequest.trim(),
        estado: formEstado,
        respuesta: formRespuesta.trim(),
      });
      setEditingRequest(null);
      await load();
    } catch {
      setError('Error al guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const emptyMessage = search
    ? `Sin resultados para "${search}"`
    : estadoFilter !== 'all'
      ? 'No hay peticiones con ese estado'
      : 'Aún no hay peticiones. Cuando alguien escriba, aparecerá aquí como una carta.';

  return (
    <div className="space-y-6">
      {/* ── Encabezado pastoral ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        {/* luz de vela */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-primary/10 blur-[50px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 -bottom-24 h-48 w-48 rounded-full bg-warning/8 blur-[40px]"
        />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-[60ch]">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
              Pastoral · Muro de oración
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-[26px]">Peticiones de oración</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Cada tarjeta es una persona que confió su oración a la emisora. Lee con calma, responde cuando puedas y deja
              que el estado cuente el camino.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sunken px-3 py-1 font-mono text-xs tabular-nums">
                <Heart className="h-3.5 w-3.5 text-primary" />
                {total} en total
              </span>
              {unreadCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" aria-hidden />
                  {unreadCount} sin leer
                </span>
              )}
              <span className="hidden items-center gap-1 font-mono text-xs text-faint sm:inline-flex">
                <Sparkles className="h-3 w-3" /> Se actualiza en vivo
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="gap-1.5 bg-card transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* ── Filtros · barra de control ─────────────────────────────────────── */}
      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4">
            {/* Fila superior: chips + búsqueda */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEstadoFilter('all');
                    setPage(1);
                  }}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-[transform,background-color,border-color,color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                    estadoFilter === 'all'
                      ? 'border-primary/30 bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  Todas{total > 0 ? ` · ${total}` : ''}
                </button>
                {STATUSES.map((status) => {
                  const meta = STATUS_META[status];
                  const active = estadoFilter === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        setEstadoFilter(status);
                        setPage(1);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-[transform,background-color,border-color] duration-150 active:scale-[0.97] ${
                        active ? meta.chip : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
                      {meta.label}
                      {counts ? ` · ${counts[status]}` : ''}
                    </button>
                  );
                })}
              </div>
              <div className="relative w-full lg:w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Buscar por nombre o palabra de la oración…"
                  className="h-9 border-border bg-sunken pl-9 text-sm placeholder:text-faint focus-visible:ring-primary/20"
                />
              </div>
            </div>

            {/* Barra de selección masiva — flotante, con blur */}
            <AnimatePresence>
              {selectedIds.size > 0 && (
                <motion.div
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-sunken/80 px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-sunken/60"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-primary px-2.5 py-1 font-mono text-xs font-semibold text-primary-foreground">
                      {selectedIds.size}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {selectedIds.size === 1 ? 'seleccionada' : 'seleccionadas'}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateSelection(new Set())}
                      className="font-mono text-xs text-faint underline decoration-border underline-offset-4 hover:text-foreground"
                    >
                      Limpiar
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleBulkRead()}
                      disabled={bulkBusy}
                      className="h-7 gap-1.5 rounded-full border-border bg-card text-xs active:scale-[0.97]"
                    >
                      <MailOpen className="h-3.5 w-3.5" />
                      Marcar leídas
                    </Button>
                    <Select
                      value={bulkStatusValue}
                      onValueChange={(v) => {
                        setBulkStatusValue(v as PrayerStatus);
                        void handleBulkStatus(v as PrayerStatus);
                      }}
                      disabled={bulkBusy}
                    >
                      <SelectTrigger className="h-7 w-[148px] rounded-full border-border bg-card text-xs">
                        <SelectValue placeholder="Cambiar estado…" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_META[s].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingBulkDelete(true)}
                      disabled={bulkBusy}
                      className="h-7 gap-1 rounded-full border-destructive/20 bg-card text-xs text-destructive hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Toggle seleccionar todo — siempre visible cuando hay filas */}
            {!loading && requests.length > 0 && (
              <label className="inline-flex cursor-pointer items-center gap-2 self-start text-xs text-muted-foreground">
                <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                {allOnPageSelected ? 'Deseleccionar página' : 'Seleccionar página'}
                <span className="font-mono text-faint">· {requests.length} en esta página</span>
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Lista de cartas ─────────────────────────────────────────────────── */}
      {error ? (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-3 gap-2 active:scale-[0.97]">
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : loading && requests.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-border bg-card p-5"
              style={{ opacity: 1 - i * 0.12 }}
            >
              <div className="flex gap-3">
                <div className="h-4 w-4 rounded bg-border" />
                <div className="flex-1 space-y-3">
                  <div className="h-3 w-1/4 rounded bg-border" />
                  <div className="h-4 w-full rounded bg-border" />
                  <div className="h-4 w-5/6 rounded bg-border" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : requests.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sunken ring-1 ring-border">
              <Heart className="h-5 w-5 text-faint" />
            </span>
            <p className="mt-4 font-medium">Sin peticiones aquí</p>
            <p className="mx-auto mt-1 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">{emptyMessage}</p>
            {(search || estadoFilter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 rounded-full active:scale-[0.97]"
                onClick={() => {
                  setSearch('');
                  setSearchInput('');
                  setEstadoFilter('all');
                  setPage(1);
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {requests.map((req, idx) => {
              const meta = STATUS_META[req.estado];
              const unread = !req.readAt;
              return (
                <motion.article
                  key={req.id}
                  layout={!shouldReduceMotion}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.16 }
                      : { type: 'spring', duration: 0.44, bounce: 0.14, delay: Math.min(idx * 0.035, 0.16) }
                  }
                  className={`group relative overflow-hidden rounded-2xl border bg-card text-card-foreground transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:shadow-[0_8px_24px_hsl(var(--foreground)/0.06)] hover:border-border ${
                    unread ? 'border-primary/20 shadow-[0_0_0_1px_hsl(var(--primary)/0.08)]' : 'border-border'
                  } ${selectedIds.has(req.id) ? 'ring-1 ring-primary/30 border-primary/30' : ''}`}
                >
                  {/* filo de papel — ámbar sutil si no leída */}
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-[3px] transition-colors ${unread ? 'bg-primary/70' : 'bg-border group-hover:bg-border'}`}
                  />
                  {/* esquina doblada — firma */}
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute right-0 top-0 h-6 w-6 overflow-hidden rounded-bl-xl border-l border-b bg-sunken transition-opacity ${unread ? 'opacity-100 border-primary/15' : 'opacity-0 group-hover:opacity-60 border-border'}`}
                    style={{
                      clipPath: 'polygon(100% 0, 0 0, 100% 100%)',
                      background: unread ? 'hsl(var(--primary) / 0.06)' : 'hsl(var(--surface-sunken))',
                    }}
                  />

                  <div className="p-4 sm:p-5">
                    {/* Cabecera de la carta */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <Checkbox
                          checked={selectedIds.has(req.id)}
                          onCheckedChange={() => toggleSelected(req.id)}
                          aria-label={`Seleccionar petición de ${req.name}`}
                          className="mt-1 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {unread && (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]" aria-hidden />
                                <span className="sr-only">Sin leer</span>
                              </span>
                            )}
                            <h3 className="truncate text-sm font-semibold tracking-tight">{req.name}</h3>
                            <span className="hidden h-1 w-1 rounded-full bg-border sm:block" aria-hidden />
                            <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-faint">
                              <Clock className="h-3 w-3" />
                              {timeAgo(req.createdAt, now)}
                            </span>
                            <Badge variant="outline" className={`rounded-full border px-2 py-0 text-[11px] font-medium ${meta.chip}`}>
                              <span className={`mr-1 h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
                              {meta.label}
                            </Badge>
                            {req.respuesta && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                                <CheckCircle2 className="h-3 w-3" /> Respondida
                              </span>
                            )}
                          </div>
                          <p className="mt-1 font-mono text-xs text-faint">
                            Recibida {new Date(req.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })} ·{' '}
                            {req.readAt ? 'Leída' : 'Sin leer'}
                            {req.answeredAt ? ` · Respondida ${timeAgo(req.answeredAt, now)}` : ''}
                          </p>
                        </div>
                      </div>

                      {/* Acciones rápidas */}
                      <div className="flex shrink-0 items-center gap-1">
                        {unread && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleMarkRead(req.id)}
                            disabled={busyId === req.id}
                            className="h-7 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.97] transition-transform duration-150"
                          >
                            <MailOpen className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Leída</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditor(req)}
                          className="h-7 gap-1 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground active:scale-[0.97] transition-transform duration-150"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Responder</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDelete(req)}
                          disabled={busyId === req.id}
                          aria-label="Eliminar petición"
                          className="h-7 w-7 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-[0.97] transition-transform duration-150"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Cuerpo — voz humana en serif */}
                    <div className="relative mt-3 rounded-xl bg-sunken px-4 py-4 ring-1 ring-border">
                      <Quote className="absolute right-3 top-3 h-4 w-4 text-faint/40" aria-hidden />
                      <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed tracking-[-0.01em] text-foreground/90">
                        {req.request}
                      </p>
                    </div>

                    {/* Respuesta — si existe, como nota pastoral */}
                    {req.respuesta && (
                      <div className="mt-3 rounded-xl border border-success/15 bg-success/5 px-4 py-3">
                        <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-success">
                          <ArrowUpRight className="h-3 w-3" /> Respuesta enviada
                        </p>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">{req.respuesta}</p>
                      </div>
                    )}

                    {/* Pie — cambio de estado */}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-faint">Estado</span>
                        <Select
                          value={req.estado}
                          onValueChange={(v) => void handleQuickStatus(req.id, v as PrayerStatus)}
                          disabled={busyId === req.id}
                        >
                          <SelectTrigger className="h-7 w-[160px] rounded-full border-border bg-sunken text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_META[s].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <span className="font-mono text-xs tabular-nums text-faint">
                        {timeAgo(req.createdAt, now)} · {req.answeredAt ? `respondida ${timeAgo(req.answeredAt, now)}` : 'sin respuesta'}
                      </span>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `¿Eliminar la petición de ${pendingDelete.name}?` : 'Eliminar petición'}
        description="Esta acción no se puede deshacer. La carta se retirará del muro."
        confirmLabel="Eliminar"
        loading={busyId !== null}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete.id)}
      />
      <ConfirmDialog
        open={pendingBulkDelete}
        onOpenChange={(open) => !open && setPendingBulkDelete(false)}
        title={`¿Eliminar ${selectedIds.size} petición${selectedIds.size === 1 ? '' : 'es'}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={bulkBusy}
        onConfirm={() => {
          setPendingBulkDelete(false);
          void handleBulkDelete();
        }}
      />

      {/* ── Sheet — responder como carta ───────────────────────────────────── */}
      <Sheet open={editingRequest !== null} onOpenChange={(open) => !open && setEditingRequest(null)}>
        <SheetContent side="right" className="flex w-full flex-col border-border bg-card p-0 sm:max-w-[520px]">
          <SheetHeader className="border-b border-border px-6 py-5 pr-10 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10">
                <Heart className="h-4 w-4 text-primary" />
              </span>
              Responder con cuidado
            </SheetTitle>
            <SheetDescription className="text-sm leading-relaxed">
              {editingRequest ? (
                <>
                  Carta de <span className="font-medium text-foreground">{editingRequest.name}</span> · recibida{' '}
                  {timeAgo(editingRequest.createdAt, now)} · {editingRequest.readAt ? 'Leída' : 'Sin leer'}
                </>
              ) : (
                'Edita la petición y deja una respuesta pastoral.'
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Nombre</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Nombre de la persona"
                className="border-border bg-sunken focus-visible:ring-primary/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Petición original</label>
              <Textarea
                value={formRequest}
                onChange={(e) => setFormRequest(e.target.value)}
                rows={5}
                placeholder="Texto de la petición"
                className="border-border bg-sunken font-serif text-[15px] leading-relaxed focus-visible:ring-primary/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Estado</label>
              <Select value={formEstado} onValueChange={(v) => setFormEstado(v as PrayerStatus)}>
                <SelectTrigger className="w-full border-border bg-sunken">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_META[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Respuesta pastoral</label>
              <Textarea
                value={formRespuesta}
                onChange={(e) => setFormRespuesta(e.target.value)}
                rows={7}
                placeholder="Escribe una respuesta breve y cercana. Se enviará como notificación si la persona la tiene activa."
                className="border-border bg-sunken text-sm leading-relaxed focus-visible:ring-primary/20"
              />
              <p className="flex items-start gap-1.5 rounded-lg bg-info/8 px-3 py-2 text-xs leading-relaxed text-muted-foreground ring-1 ring-info/15">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                Si la petición vino desde la app móvil con notificaciones activas, guardar una respuesta nueva envía una push automática.
              </p>
            </div>
          </div>

          <SheetFooter className="border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={() => setEditingRequest(null)} className="rounded-full active:scale-[0.97]">
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveEdit()}
              disabled={saving || !formName.trim() || !formRequest.trim()}
              className="gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-transform duration-150"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Guardando…' : 'Guardar y notificar'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {total > 0 && (
        <AdminPagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          label={`${total} peticiones · Página ${page} de ${Math.max(1, totalPages)}`}
        />
      )}
    </div>
  );
}
