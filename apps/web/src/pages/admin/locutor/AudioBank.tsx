import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Library, RefreshCw, Play, Square, Trash2, FileAudio, Eraser } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { formatClock, timeAgo } from '@/lib/format';
import { describeRequestError } from '@/lib/apiErrors';
import { apiUrl } from '@/config';
import axios from 'axios';
import { toast } from 'sonner';
import type { LocutorAudio } from '@radio/types';
import { Section } from './Section';

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  ready: { label: 'Listo', color: 'bg-success/10 text-success border-success/25', dot: 'bg-success' },
  pending: { label: 'Pendiente', color: 'bg-warning/10 text-warning border-warning/25', dot: 'bg-warning' },
  error: { label: 'Error', color: 'bg-destructive/10 text-destructive border-destructive/25', dot: 'bg-destructive' },
  expired: { label: 'Expirado', color: 'bg-muted text-faint border-border', dot: 'bg-faint/60' },
};

/**
 * Audios the station will never play again: the reuse lookup only accepts
 * `ready`, and the scheduled playback rejects anything else. They are pure disk,
 * which is what makes clearing them the one bulk delete worth offering.
 */
const UNPLAYABLE_STATUSES = new Set(['error', 'expired']);

const PROVIDER_LABELS: Record<string, { label: string; color: string }> = {
  elevenlabs: { label: 'ElevenLabs', color: 'bg-success/10 text-success border-success/20' },
  kokoro: { label: 'Kokoro', color: 'bg-info/10 text-info border-info/20' },
};

/**
 * The voice column already carries the provider-qualified id
 * (`elevenlabs:abc123`), so this badge only answers the question the id
 * cannot: whether this file came from the engine the station pays for or from
 * the fallback.
 */
function ProviderBadge({ provider }: { provider: string }) {
  const config = PROVIDER_LABELS[provider];
  if (!config) return null;

  return (
    <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${config.color}`}>
      {config.label}
    </span>
  );
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function BankCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span className={`font-mono text-base font-semibold tabular-nums ${tone}`}>{value}</span>
      <span className="text-xs text-faint">{label}</span>
    </p>
  );
}

export default function AudioBank() {
  const { getLocutorAudios, deleteLocutorAudio, bulkDeleteLocutorAudios } = useAdminApi();
  const { token } = useAdminAuth();
  const shouldReduceMotion = useReducedMotion();
  const [audios, setAudios] = useState<LocutorAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LocutorAudio | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);

  const selectedCount = selection.size;
  const allSelected = audios.length > 0 && selectedCount === audios.length;
  const unplayableIds = audios
    .filter((audio) => UNPLAYABLE_STATUSES.has(audio.status))
    .map((audio) => audio.id);
  const selectionCoveredByShortcut =
    unplayableIds.length > 0 && unplayableIds.every((id) => selection.has(id));

  const loadAudios = useCallback(async () => {
    try {
      const result = await getLocutorAudios().then(
        (data) => ({ ok: true as const, data }),
        (): { ok: false; data: null } => ({ ok: false, data: null })
      );
      if (result.ok) {
        setAudios(result.data);
        setError(null);
      } else {
        setError('Error al cargar los audios.');
      }
    } finally {
      setLoading(false);
    }
  }, [getLocutorAudios]);

  useEffect(() => {
    void loadAudios();
  }, [loadAudios]);

  const toggleSelected = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => setSelection(allSelected ? new Set() : new Set(audios.map((a) => a.id)));

  const selectUnplayable = () => setSelection(new Set(unplayableIds));

  const forgetAudios = (ids: string[]) => {
    const gone = new Set(ids);
    setAudios((prev) => prev.filter((audio) => !gone.has(audio.id)));
    setSelection((prev) => new Set([...prev].filter((id) => !gone.has(id))));
  };

  const handleDelete = async (id: string) => {
    setPendingDelete(null);
    setDeletingId(id);
    try {
      await deleteLocutorAudio(id);
      forgetAudios([id]);
      toast.success('Audio eliminado');
    } catch (err) {
      setError(describeRequestError(err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selection];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const { count, filesFailed } = await bulkDeleteLocutorAudios(ids);
      forgetAudios(ids);
      setSelection(new Set());
      if (filesFailed > 0) {
        toast.warning(
          `${count} audio${count === 1 ? '' : 's'} eliminado${count === 1 ? '' : 's'}, pero ${filesFailed} archivo${filesFailed === 1 ? '' : 's'} sigue${filesFailed === 1 ? '' : 'n'} en disco`
        );
      } else {
        toast.success(`${count} audio${count === 1 ? '' : 's'} eliminado${count === 1 ? '' : 's'}`);
      }
    } catch (err) {
      setError(describeRequestError(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const handlePlay = async (audio: LocutorAudio) => {
    if (audioUrls[audio.id]) {
      setPlayingId(playingId === audio.id ? null : audio.id);
      return;
    }
    setLoadingAudioId(audio.id);
    try {
      const res = await axios.get(apiUrl(`/admin-api/locutor/audios/${audio.id}/stream`), {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      setAudioUrls((prev) => ({ ...prev, [audio.id]: url }));
      setPlayingId(audio.id);
    } catch {
      toast.error('No se pudo cargar el audio.');
    } finally {
      setLoadingAudioId(null);
    }
  };

  return (
    <Section
      title="Banco de audios"
      description="Cada locución ya generada. El sistema solo reutiliza las que están listas, así que borrar una es la forma de forzar una nueva."
      icon={Library}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadAudios()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      }
    >
      {/* The counts lead because they decide what the operator does next:
          ready audios are reusable, the rest only occupy disk. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <BankCount label="Listos" value={audios.filter((a) => a.status === 'ready').length} tone="text-success" />
        <BankCount label="Pendientes" value={audios.filter((a) => a.status === 'pending').length} tone="text-warning" />
        <BankCount label="Con error" value={audios.filter((a) => a.status === 'error').length} tone="text-destructive" />
        <span className="font-mono text-[11px] text-faint">
          {audios.length} en total
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <AnimatePresence>
          {selectedCount > 0 && (
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-sunken/80 px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary px-2.5 py-1 font-mono text-xs font-semibold text-primary-foreground">
                  {selectedCount}
                </span>
                <span className="text-sm text-muted-foreground">
                  {selectedCount === 1 ? 'seleccionado' : 'seleccionados'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelection(new Set())}
                  disabled={bulkBusy}
                  className="font-mono text-xs text-faint underline decoration-border underline-offset-4 hover:text-foreground"
                >
                  Limpiar
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {unplayableIds.length > 0 && !selectionCoveredByShortcut && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectUnplayable}
                    disabled={bulkBusy}
                    title="El sistema solo reutiliza audios en estado Listo. Los demás ocupan disco sin volver a sonar."
                    className="h-7 gap-1.5 rounded-full border-border bg-card text-xs active:scale-[0.97]"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    Seleccionar los que no se reproducen
                    <span className="font-mono tabular-nums text-faint">{unplayableIds.length}</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingBulkDelete(true)}
                  disabled={bulkBusy}
                  className="h-7 gap-1.5 rounded-full border-destructive/20 bg-card text-xs text-destructive hover:bg-destructive/10 hover:text-destructive active:scale-[0.97]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </p>
        )}

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-11 pl-4">
                <Checkbox
                  checked={allSelected ? true : selectedCount > 0 ? 'indeterminate' : false}
                  onCheckedChange={toggleSelectAll}
                  disabled={loading || audios.length === 0}
                  aria-label="Seleccionar todos los audios"
                  className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                Archivo
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                Texto generado
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                Voz
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                Duración
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                Estado
              </TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <div className="h-6 rounded animate-pulse bg-sunken" />
                  </TableCell>
                </TableRow>
              ))
            ) : audios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <FileAudio className="mx-auto mb-2 size-8 text-faint opacity-50" />
                  <p className="text-sm text-muted-foreground">No hay audios generados</p>
                  <p className="mt-0.5 text-xs text-faint">
                    Genera uno desde una plantilla para ver la locución antes de que salga al aire.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              audios.map((audio) => {
                const status = STATUS_CONFIG[audio.status] ?? {
                  label: audio.status,
                  color: 'bg-muted text-faint border-border',
                  dot: 'bg-faint/60',
                };
                const selected = selection.has(audio.id);
                return (
                  <TableRow key={audio.id} className={selected ? 'bg-primary/5' : undefined}>
                    <TableCell className="pl-4">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleSelected(audio.id)}
                        disabled={bulkBusy}
                        aria-label={audio.filename}
                        className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                    </TableCell>
                    {/* The filename is machine-generated noise; the text that was
                        actually spoken is what the operator is checking, so it
                        gets the readable cell and the name stays mono. */}
                    <TableCell className="max-w-44">
                      <p className="truncate font-mono text-xs text-faint" title={audio.filename}>
                        {audio.filename}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {timeAgo(audio.generatedAt)}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <p className="line-clamp-2 text-foreground/90" title={audio.textRendered}>
                        {audio.textRendered || '—'}
                      </p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <p className="truncate font-mono text-xs" title={audio.voice}>
                        {audio.voice}
                      </p>
                      <ProviderBadge provider={audio.provider} />
                    </TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-foreground">
                        {formatClock((audio.durationMs ?? 0) / 1000)}
                      </span>
                      <span className="ml-1 text-xs text-faint">{formatBytes(audio.fileSizeBytes)}</span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${status.color}`}
                      >
                        <span aria-hidden className={`size-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {audio.status === 'ready' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-8 h-8"
                              onClick={() => void handlePlay(audio)}
                              disabled={loadingAudioId === audio.id}
                              title={playingId === audio.id ? 'Detener' : 'Reproducir'}
                            >
                              {loadingAudioId === audio.id ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : playingId === audio.id ? (
                                <Square className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                            {playingId === audio.id && audioUrls[audio.id] && (
                              <audio
                                src={audioUrls[audio.id]}
                                controls
                                autoPlay
                                className="h-8 w-40"
                                onEnded={() => setPlayingId(null)}
                              />
                            )}
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setPendingDelete(audio)}
                          disabled={deletingId === audio.id}
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="¿Eliminar este audio?"
        description="Se eliminan el archivo y sus horarios, y el sistema vuelve a generar el aviso en la próxima comprobación. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={deletingId !== null}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete.id)}
      />

      <ConfirmDialog
        open={pendingBulkDelete}
        onOpenChange={(open) => !open && setPendingBulkDelete(false)}
        title={`¿Eliminar ${selectedCount} audio${selectedCount === 1 ? '' : 's'}?`}
        description="Se eliminan los archivos y sus horarios. Los avisos se vuelven a generar en la próxima comprobación. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={bulkBusy}
        onConfirm={() => {
          setPendingBulkDelete(false);
          void handleBulkDelete();
        }}
      />
    </Section>
  );
}
