import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { AdminPagination } from '@/components/ui-custom/AdminPagination';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { usePrayerEvents } from '@/hooks/usePrayerEvents';
import { timeAgo } from '@/lib/format';
import { PRAYER_STATUS, type PrayerRequest, type PrayerStatus, type PrayerStatusCounts } from '@radio/types';

const STATUSES = Object.values(PRAYER_STATUS);

const STATUS_META: Record<PrayerStatus, { label: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  EN_REVISION: { label: 'En revisión', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  RESPONDIDA: { label: 'Respondida', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  CERRADA: { label: 'Cerrada', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
};

type EstadoFilter = PrayerStatus | 'all';

const PAGE_SIZE = 20;

// Sentinel shared by every "no selection" state so identity stays stable.
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

  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({
    key: '',
    ids: new Set(),
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<PrayerStatus | ''>('');
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);

  // Selection is scoped to what the user sees: changing page, filter or
  // search invalidates it by key instead of resetting it in an effect.
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

  const load = useCallback(async () => {
    try {
      const data = await getPrayerRequests({
        page,
        limit: PAGE_SIZE,
        estado: estadoFilter === 'all' ? undefined : estadoFilter,
        search: search || undefined,
      });
      setRequests(data.rows);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setCounts(data.counts);
      setUnreadCount(data.unreadCount);
      setError(null);
      setNow(Date.now());
    } catch {
      setError('Error al obtener peticiones de oración.');
    } finally {
      setLoading(false);
    }
  }, [getPrayerRequests, page, estadoFilter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  usePrayerEvents((event) => {
    void load();
    toast('Nueva petición de oración', {
      description: `Enviada por ${event.name}`,
    });
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

  const toggleSelectAll = () => {
    updateSelection(allOnPageSelected ? new Set() : new Set(requests.map((req) => req.id)));
  };

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
      return `${count} petición${count === 1 ? '' : 'es'} marcada${count === 1 ? '' : 's'} como leída${count === 1 ? '' : 's'}`;
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
      : 'No hay peticiones de oración recibidas';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Peticiones de oración</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <Card className="border-slate-700 bg-slate-800/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Heart className="w-4 h-4 text-rose-500" />
            Recibidas
          </CardTitle>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEstadoFilter('all');
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  estadoFilter === 'all'
                    ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-600 text-slate-400 hover:text-slate-200'
                }`}
              >
                Todas{total > 0 ? ` · ${total}` : ''}
              </button>
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setEstadoFilter(status);
                    setPage(1);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    estadoFilter === status
                      ? STATUS_META[status].color
                      : 'border-slate-600 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {STATUS_META[status].label}
                  {counts ? ` · ${counts[status]}` : ''}
                </button>
              ))}
              {unreadCount > 0 && (
                <Badge variant="outline" className="text-xs border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                  {unreadCount} sin leer
                </Badge>
              )}
            </div>
            <div className="relative w-full lg:w-64">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por nombre o texto..."
                className="pl-8 bg-slate-900 border-slate-600"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!error && !loading && requests.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-700/60">
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} />
                {allOnPageSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </label>
              <AnimatePresence>
                {selectedIds.size > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="text-xs text-slate-400">
                      {selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleBulkRead()}
                      disabled={bulkBusy}
                      className="h-7 gap-1 text-xs"
                    >
                      <MailOpen className="w-3 h-3" />
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
                      <SelectTrigger className="h-7 w-36 text-xs bg-slate-900 border-slate-600">
                        <SelectValue placeholder="Cambiar estado..." />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {STATUS_META[status].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingBulkDelete(true)}
                      disabled={bulkBusy}
                      className="h-7 gap-1 text-xs text-red-400 hover:text-red-300 border-red-500/30"
                    >
                      <Trash2 className="w-3 h-3" />
                      Eliminar
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {error ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-slate-400">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="mt-2 gap-2">
                <RefreshCw className="w-3 h-3" />
                Reintentar
              </Button>
            </div>
          ) : loading && requests.length === 0 ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg animate-pulse bg-slate-700" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 opacity-60" />
              <p className="text-slate-400">{emptyMessage}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {requests.map((req) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className={`p-4 rounded-lg space-y-3 bg-slate-900 border border-slate-700 ${
                        req.readAt ? '' : 'border-l-indigo-500 border-l-2'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={selectedIds.has(req.id)}
                            onCheckedChange={() => toggleSelected(req.id)}
                            aria-label={`Seleccionar petición de ${req.name}`}
                            className="mt-0.5"
                          />
                          {!req.readAt && <span className="w-2 h-2 shrink-0 rounded-full bg-indigo-500" />}
                          <p className="font-medium text-sm truncate">{req.name}</p>
                          <span className="text-xs text-slate-500 shrink-0">{timeAgo(req.createdAt, now)}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!req.readAt && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleMarkRead(req.id)}
                              disabled={busyId === req.id}
                              className="gap-1 h-7 px-2 text-xs"
                            >
                              <MailOpen className="w-3 h-3" />
                              Leída
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditor(req)}
                            className="gap-1 h-7 px-2 text-xs"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(req)}
                            disabled={busyId === req.id}
                            className="gap-1 h-7 px-2 text-xs text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3 h-3" />
                            Eliminar
                          </Button>
                        </div>
                      </div>

                      <p className="text-sm whitespace-pre-wrap text-slate-300">{req.request}</p>

                      {req.respuesta && (
                        <div className="p-2 rounded text-sm bg-indigo-500/10 text-indigo-300 space-y-1">
                          <p className="font-medium text-xs">Respuesta:</p>
                          <p className="whitespace-pre-wrap">{req.respuesta}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Estado:</span>
                          <Select
                            value={req.estado}
                            onValueChange={(v) => void handleQuickStatus(req.id, v as PrayerStatus)}
                            disabled={busyId === req.id}
                          >
                            <SelectTrigger className="h-7 w-36 text-xs bg-slate-900 border-slate-600">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {STATUS_META[status].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeAgo(req.createdAt, now)}
                          </span>
                          {req.answeredAt && <span>Respondida {timeAgo(req.answeredAt, now)}</span>}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          <ConfirmDialog
            open={pendingDelete !== null}
            onOpenChange={(open) => !open && setPendingDelete(null)}
            title={pendingDelete ? `¿Eliminar la petición de ${pendingDelete.name}?` : 'Eliminar petición'}
            description="Esta acción no se puede deshacer."
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

          <Sheet open={editingRequest !== null} onOpenChange={(open) => !open && setEditingRequest(null)}>
            <SheetContent side="right" className="sm:max-w-lg flex flex-col">
              <SheetHeader className="pr-10">
                <SheetTitle>Editar petición</SheetTitle>
                <SheetDescription>
                  Recibida {editingRequest ? timeAgo(editingRequest.createdAt, now) : ''} ·{' '}
                  {editingRequest?.readAt ? 'Leída' : 'Sin leer'}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-4 space-y-4 min-h-0">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Nombre</label>
                  <Input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Nombre de la persona"
                    className="bg-slate-900 border-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Petición</label>
                  <Textarea
                    value={formRequest}
                    onChange={(e) => setFormRequest(e.target.value)}
                    rows={5}
                    placeholder="Texto de la petición"
                    className="bg-slate-900 border-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Estado</label>
                  <Select value={formEstado} onValueChange={(v) => setFormEstado(v as PrayerStatus)}>
                    <SelectTrigger className="w-full bg-slate-900 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_META[status].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-400">Respuesta</label>
                  <Textarea
                    value={formRespuesta}
                    onChange={(e) => setFormRespuesta(e.target.value)}
                    rows={6}
                    placeholder="Respuesta enviada a la persona (opcional)"
                    className="bg-slate-900 border-slate-600"
                  />
                  <p className="text-[11px] text-slate-500">
                    Si la petición vino desde la app móvil con notificaciones activas, guardar una respuesta nueva envía una push.
                  </p>
                </div>
              </div>

              <SheetFooter className="px-4 pb-4">
                <Button variant="ghost" onClick={() => setEditingRequest(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => void handleSaveEdit()}
                  disabled={saving || !formName.trim() || !formRequest.trim()}
                  className="gap-1"
                >
                  <Save className="w-3 h-3" />
                  {saving ? 'Guardando...' : 'Guardar cambios'}
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
        </CardContent>
      </Card>
    </div>
  );
}
