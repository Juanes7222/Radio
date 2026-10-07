import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Copy,
  Inbox,
  MailOpen,
  MessageSquareText,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdminPagination } from '@/components/ui-custom/AdminPagination';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { timeAgo } from '@/lib/format';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackMessage,
  type FeedbackStatus,
  type FeedbackStatusCounts,
} from '@radio/types';

const STATUSES = Object.values(FEEDBACK_STATUSES);
const CATEGORIES = Object.values(FEEDBACK_CATEGORIES);

const STATUS_META: Record<FeedbackStatus, { label: string; chip: string; dot: string }> = {
  PENDIENTE: {
    label: 'Pendiente',
    chip: 'bg-warning/10 text-warning border-warning/20',
    dot: 'bg-warning',
  },
  RESUELTO: {
    label: 'Resuelto',
    chip: 'bg-success/10 text-success border-success/20',
    dot: 'bg-success',
  },
  DESCARTADO: {
    label: 'Descartado',
    chip: 'bg-muted text-muted-foreground border-border',
    dot: 'bg-faint',
  },
};

type EstadoFilter = FeedbackStatus | 'all';
type CategoriaFilter = FeedbackCategory | 'all';

/** The inbox polls itself; without this the team only sees a message on reload. */
const POLL_INTERVAL_MS = 60_000;
const PAGE_SIZE = 20;

export default function AdminFeedback() {
  const { getFeedbackMessages, updateFeedbackStatus, markFeedbackRead, deleteFeedbackMessage } =
    useAdminApi();
  const shouldReduceMotion = useReducedMotion();

  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState<FeedbackStatusCounts | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>('all');
  const [categoriaFilter, setCategoriaFilter] = useState<CategoriaFilter>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FeedbackMessage | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const appliedSearchRef = useRef('');

  const load = useCallback(
    (silent = false) =>
      getFeedbackMessages({
        page,
        limit: PAGE_SIZE,
        estado: estadoFilter === 'all' ? undefined : estadoFilter,
        categoria: categoriaFilter === 'all' ? undefined : categoriaFilter,
        search: search || undefined,
      })
        .then((data) => {
          setMessages(data.rows);
          setTotal(data.total);
          setTotalPages(data.totalPages);
          setCounts(data.counts);
          setUnreadCount(data.unreadCount);
          setError(null);
          setNow(Date.now());
        })
        .catch(() => setError('No se pudieron cargar los mensajes. Inténtalo de nuevo.'))
        .finally(() => {
          if (!silent) setLoading(false);
        }),
    [getFeedbackMessages, page, estadoFilter, categoriaFilter, search]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void load();
  }, [load]);

  const handleQuickStatus = async (id: string, estado: FeedbackStatus) => {
    setBusyId(id);
    try {
      await updateFeedbackStatus(id, { estado });
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
      await markFeedbackRead(id);
      await load();
    } catch {
      setError('Error al marcar como leído.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setPendingDelete(null);
    setBusyId(id);
    try {
      await deleteFeedbackMessage(id);
      if (messages.length === 1 && page > 1) setPage((current) => current - 1);
      else await load();
    } catch {
      setError('Error al eliminar el mensaje.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyContact = async (contact: string) => {
    try {
      await navigator.clipboard.writeText(contact);
      toast.success('Contacto copiado');
    } catch {
      toast.error('No se pudo copiar. Cópielo manualmente.');
    }
  };

  const emptyMessage = search
    ? `Sin resultados para "${search}"`
    : estadoFilter !== 'all' || categoriaFilter !== 'all'
      ? 'No hay mensajes con esos filtros'
      : 'Aún no hay mensajes. Cuando alguien escriba, aparecerá aquí.';

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-primary/10 blur-[50px]"
        />
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-[60ch]">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
              Audiencia · Bandeja de entrada
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-[26px]">
              Opiniones y sugerencias
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Mensajes anónimos que la audiencia envía desde el sitio o la aplicación. No se
              publican en ningún sitio: solo los lee el equipo.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sunken px-3 py-1 font-mono text-xs tabular-nums">
                <Inbox className="h-3.5 w-3.5 text-primary" />
                {total} en total
              </span>
              {unreadCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" aria-hidden />
                  {unreadCount} sin leer
                </span>
              )}
              <span className="hidden font-mono text-xs text-faint sm:inline">
                Se actualiza cada minuto
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="gap-1.5 bg-card transition-transform duration-150 ease-out-expo active:scale-[0.97]"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setEstadoFilter('all');
                  setPage(1);
                }}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-[transform,background-color,border-color,color] duration-150 ease-out-expo active:scale-[0.97] ${
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
                      active
                        ? meta.chip
                        : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
                    {meta.label}
                    {counts ? ` · ${counts[status]}` : ''}
                  </button>
                );
              })}
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <Select
                value={categoriaFilter}
                onValueChange={(value) => {
                  setCategoriaFilter(value as CategoriaFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full rounded-full border-border bg-sunken text-xs sm:w-[168px]">
                  <SelectValue placeholder="Motivo…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los motivos</SelectItem>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {FEEDBACK_CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-[260px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Buscar por mensaje, nombre o contacto…"
                  aria-label="Buscar mensajes"
                  className="h-9 border-border bg-sunken pl-9 text-sm placeholder:text-faint focus-visible:ring-primary/20"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="mt-3 gap-2 active:scale-[0.97]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : loading && messages.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-2xl border border-border bg-card p-5"
              style={{ opacity: 1 - index * 0.12 }}
            >
              <div className="space-y-3">
                <div className="h-3 w-1/3 rounded bg-border" />
                <div className="h-4 w-full rounded bg-border" />
                <div className="h-4 w-4/5 rounded bg-border" />
              </div>
            </div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-sunken ring-1 ring-border">
              <MessageSquareText className="h-5 w-5 text-faint" />
            </span>
            <p className="mt-4 font-medium">Sin mensajes aquí</p>
            <p className="mx-auto mt-1 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
              {emptyMessage}
            </p>
            {(search || estadoFilter !== 'all' || categoriaFilter !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 rounded-full active:scale-[0.97]"
                onClick={() => {
                  setSearch('');
                  setSearchInput('');
                  setEstadoFilter('all');
                  setCategoriaFilter('all');
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
            {messages.map((message, index) => {
              const unread = !message.readAt;
              return (
                <motion.article
                  key={message.id}
                  layout={!shouldReduceMotion}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.985 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.16 }
                      : {
                          type: 'spring',
                          duration: 0.44,
                          bounce: 0.14,
                          delay: Math.min(index * 0.035, 0.16),
                        }
                  }
                  className={`overflow-hidden rounded-2xl border bg-card transition-[border-color,box-shadow] duration-200 ease-out-expo hover:shadow-[0_8px_24px_hsl(var(--foreground)/0.06)] ${
                    unread ? 'border-primary/20' : 'border-border'
                  }`}
                >
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      {unread && (
                        <span className="inline-flex items-center">
                          <span
                            className="h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                            aria-hidden
                          />
                          <span className="sr-only">Sin leer</span>
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className="rounded-full border border-border bg-sunken px-2 py-0 text-[11px] font-medium text-muted-foreground"
                      >
                        {FEEDBACK_CATEGORY_LABELS[message.categoria]}
                      </Badge>
                      <span className="h-1 w-1 rounded-full bg-border" aria-hidden />
                      <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-faint">
                        {timeAgo(message.createdAt, now)}
                      </span>
                      <span className="font-mono text-xs text-faint">
                        {new Date(message.createdAt).toLocaleDateString('es-CO', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    <p className="mt-3 whitespace-pre-wrap font-serif text-[15px] leading-relaxed tracking-[-0.01em] text-foreground/90">
                      {message.mensaje}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="text-xs text-muted-foreground">
                          {message.nombre ?? 'Anónimo'}
                        </span>
                        {message.contacto && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleCopyContact(message.contacto as string)}
                            aria-label={`Copiar el contacto ${message.contacto}`}
                            className="h-6 gap-1 rounded-full px-2 font-mono text-[11px] text-faint hover:text-foreground"
                          >
                            <Copy className="h-3 w-3" />
                            {message.contacto}
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Select
                          value={message.estado}
                          onValueChange={(value) =>
                            void handleQuickStatus(message.id, value as FeedbackStatus)
                          }
                          disabled={busyId === message.id}
                        >
                          <SelectTrigger
                            aria-label="Estado del mensaje"
                            className="h-7 w-[142px] rounded-full border-border bg-sunken text-xs"
                          >
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
                        {unread && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleMarkRead(message.id)}
                            disabled={busyId === message.id}
                            className="h-7 gap-1 rounded-full px-2.5 text-xs text-muted-foreground transition-transform duration-150 hover:bg-accent hover:text-foreground active:scale-[0.97]"
                          >
                            <MailOpen className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Leído</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDelete(message)}
                          disabled={busyId === message.id}
                          aria-label="Eliminar mensaje"
                          className="h-7 w-7 rounded-full text-muted-foreground transition-transform duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {total > 0 && (
        <AdminPagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          label={`${total} mensajes · Página ${page} de ${Math.max(1, totalPages)}`}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="¿Eliminar este mensaje?"
        description={
          pendingDelete?.nombre
            ? `El mensaje de ${pendingDelete.nombre} se retirará de la bandeja. Esta acción no se puede deshacer.`
            : 'Este mensaje anónimo se retirará de la bandeja. Esta acción no se puede deshacer.'
        }
        confirmLabel="Eliminar"
        loading={busyId !== null}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete.id)}
      />
    </div>
  );
}