import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  CheckCircle2,
  RefreshCw,
  Clock,
  Send,
  MessageSquare,
  MailOpen,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { timeAgo } from '@/lib/format';
import type { PrayerRequest, PrayerStatus } from '@radio/types';

const STATUS_CONFIG: Record<PrayerStatus, { label: string; color: string }> = {
  PENDIENTE: { label: 'Pendiente', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  EN_REVISION: { label: 'En revisión', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  RESPONDIDA: { label: 'Respondida', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  CERRADA: { label: 'Cerrada', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
};

const PAGE_SIZE = 20;

export default function AdminPrayerRequests() {
  const { getPrayerRequests, updatePrayerRequest, markPrayerRequestRead, deletePrayerRequest } = useAdminApi();

  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [respondingRequest, setRespondingRequest] = useState<PrayerRequest | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responseStatus, setResponseStatus] = useState<PrayerStatus>('RESPONDIDA');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [estadoFilter, setEstadoFilter] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PrayerRequest | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getPrayerRequests({
        page,
        limit: PAGE_SIZE,
        estado: estadoFilter === 'all' ? undefined : estadoFilter,
      }).then(
        (data) => ({
          ok: true as const,
          rows: (data as { rows?: PrayerRequest[] }).rows ?? [],
          total: (data as { total?: number }).total ?? 0,
          totalPages: (data as { totalPages?: number }).totalPages ?? 1,
        }),
        (): { ok: false; rows: never[]; total: number; totalPages: number } => ({
          ok: false,
          rows: [],
          total: 0,
          totalPages: 1,
        })
      );
      if (result.ok) {
        setRequests(result.rows);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setError(null);
        setNow(Date.now());
      } else {
        setError('Error al obtener peticiones de oración.');
      }
    } finally {
      setLoading(false);
    }
  }, [getPrayerRequests, page, estadoFilter]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleEstadoChange = (value: string) => {
    setEstadoFilter(value);
    setPage(1);
  };

  const handleRespond = async (id: string) => {
    if (!responseText.trim()) return;
    setSaving(true);
    try {
      await updatePrayerRequest(id, {
        estado: responseStatus,
        respuesta: responseText.trim(),
      });
      setRespondingRequest(null);
      setResponseText('');
      setResponseStatus('RESPONDIDA');
      await load();
    } catch {
      setError('Error al guardar la respuesta.');
    } finally {
      setSaving(false);
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

  const unreadCount = requests.filter((req) => !req.readAt).length;

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="w-4 h-4 text-rose-500" />
              Recibidas
              {total > 0 && <Badge variant="destructive" className="text-xs">{total}</Badge>}
              {unreadCount > 0 && (
                <Badge variant="outline" className="text-xs border-indigo-500/30 bg-indigo-500/10 text-indigo-300">
                  {unreadCount} sin leer
                </Badge>
              )}
            </CardTitle>
            <Select value={estadoFilter} onValueChange={handleEstadoChange}>
              <SelectTrigger className="w-44 bg-slate-900 border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                <SelectItem value="EN_REVISION">En revisión</SelectItem>
                <SelectItem value="RESPONDIDA">Respondida</SelectItem>
                <SelectItem value="CERRADA">Cerrada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
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
              <p className="text-slate-400">
                {estadoFilter === 'all'
                  ? 'No hay peticiones de oración recibidas'
                  : 'No hay peticiones con ese estado'}
              </p>
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
                      className={`p-4 rounded-lg space-y-3 bg-slate-900 border border-slate-700 ${req.readAt ? '' : 'border-l-indigo-500 border-l-2'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">{req.name}</p>
                            <Badge
                              variant="outline"
                              className={`text-xs border ${
                                STATUS_CONFIG[req.estado as PrayerStatus]?.color ?? ''
                              }`}
                            >
                              {STATUS_CONFIG[req.estado as PrayerStatus]?.label ?? req.estado}
                            </Badge>
                          </div>
                          <p className="text-sm mt-1 whitespace-pre-wrap text-slate-300">
                            {req.request}
                          </p>
                          {req.respuesta && (
                            <div className="mt-2 p-2 rounded text-sm bg-indigo-500/10 text-indigo-300">
                              <p className="font-medium text-xs mb-1">Respuesta:</p>
                              <p className="whitespace-pre-wrap">{req.respuesta}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                            <Clock className="w-3 h-3" />
                            <span>{timeAgo(req.createdAt, now)}</span>
                            {req.answeredAt && (
                              <span className="ml-2">| Respondida {timeAgo(req.answeredAt, now)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!req.readAt && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMarkRead(req.id)}
                              disabled={busyId === req.id}
                              className="gap-1"
                            >
                              <MailOpen className="w-3 h-3" />
                              Marcar leída
                            </Button>
                          )}
                          {!req.respuesta && req.estado !== 'CERRADA' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRespondingRequest(req);
                                setResponseText('');
                                setResponseStatus('RESPONDIDA');
                              }}
                              className="gap-1"
                            >
                              <MessageSquare className="w-3 h-3" />
                              Responder
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(req)}
                            disabled={busyId === req.id}
                            className="gap-1 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-3 h-3" />
                            Eliminar
                          </Button>
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

          {/* Responder en un panel lateral */}
          <Sheet
            open={respondingRequest !== null}
            onOpenChange={(open) => !open && setRespondingRequest(null)}
          >
            <SheetContent side="right" className="sm:max-w-md">
              <SheetHeader className="pr-10">
                <SheetTitle>Responder a {respondingRequest?.name}</SheetTitle>
                <SheetDescription>
                  Petición recibida {respondingRequest ? timeAgo(respondingRequest.createdAt, now) : ''}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-4 space-y-4 min-h-0">
                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className={`text-xs border ${
                        STATUS_CONFIG[respondingRequest?.estado as PrayerStatus]?.color ?? ''
                      }`}
                    >
                      {STATUS_CONFIG[respondingRequest?.estado as PrayerStatus]?.label ?? respondingRequest?.estado}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {respondingRequest?.readAt ? 'Leída' : 'Sin leer'}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-slate-300">
                    {respondingRequest?.request}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Estado</label>
                    <Select
                      value={responseStatus}
                      onValueChange={(v) => setResponseStatus(v as PrayerStatus)}
                    >
                      <SelectTrigger className="w-full bg-slate-900 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RESPONDIDA">Respondida</SelectItem>
                        <SelectItem value="EN_REVISION">En revisión</SelectItem>
                        <SelectItem value="PENDIENTE">Pendiente</SelectItem>
                        <SelectItem value="CERRADA">Cerrada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Respuesta</label>
                    <Textarea
                      placeholder="Escribe tu respuesta..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      rows={6}
                      className="bg-slate-900 border-slate-600"
                    />
                  </div>
                </div>
              </div>

              <SheetFooter className="px-4 pb-4">
                <Button variant="ghost" onClick={() => setRespondingRequest(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => respondingRequest && void handleRespond(respondingRequest.id)}
                  disabled={saving || !responseText.trim()}
                  className="gap-1"
                >
                  <Send className="w-3 h-3" />
                  {saving ? 'Guardando...' : 'Guardar respuesta'}
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
