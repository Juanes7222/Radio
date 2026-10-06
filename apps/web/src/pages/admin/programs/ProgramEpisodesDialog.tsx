import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCheck,
  ListMusic,
  Loader2,
  PlayCircle,
  RotateCcw,
  Send,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatDuration } from '@/lib/format';
import { toast } from 'sonner';
import type { Program, ProgramEpisode } from '@radio/types';
import { EPISODE_STATUS_CLASSES, EPISODE_STATUS_LABELS, errorMessage } from './shared';

const POLL_INTERVAL_MS = 4000;

interface Props {
  open: boolean;
  program: Program;
  onClose: () => void;
  onChanged: () => void;
}

export function ProgramEpisodesDialog({ open, program, onClose, onChanged }: Props) {
  const {
    getProgramEpisodes,
    markProgramEpisodePlayed,
    requeueProgramEpisode,
    deleteProgramEpisode,
    publishProgramEpisode,
    fetchProgramEpisodePreview,
  } = useAdminApi();

  const [episodes, setEpisodes] = useState<ProgramEpisode[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProgramEpisode | null>(null);

  const load = useCallback(async () => {
    try {
      const { episodes: rows } = await getProgramEpisodes(program.id);
      setEpisodes(rows);
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudieron cargar los episodios.'));
    } finally {
      setLoading(false);
    }
  }, [getProgramEpisodes, program.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getProgramEpisodes(program.id)
      .then(({ episodes: rows }) => {
        if (cancelled) return;
        setEpisodes(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(errorMessage(err, 'No se pudieron cargar los episodios.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, getProgramEpisodes, program.id]);

  // Publishing a draft is a long upload, so the list keeps polling until it lands.
  useEffect(() => {
    if (!open) return;
    const busy = episodes.some((episode) => episode.status === 'processing');
    if (!busy) return;
    const timer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [open, episodes, load]);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const loadPreview = async (episode: ProgramEpisode) => {
    setBusyId(episode.id);
    try {
      const url = await fetchProgramEpisodePreview(episode.id);
      setPreviewUrls((current) => ({ ...current, [episode.id]: url }));
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cargar la preview.'));
    } finally {
      setBusyId(null);
    }
  };

  const runAction = async (episode: ProgramEpisode, action: () => Promise<ProgramEpisode>) => {
    setBusyId(episode.id);
    try {
      await action();
      await load();
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo completar la acción.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const episode = pendingDelete;
    setPendingDelete(null);
    setBusyId(episode.id);
    try {
      await deleteProgramEpisode(episode.id);
      await load();
      onChanged();
      toast.success('Episodio eliminado.');
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar el episodio.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Episodios · {program.name}</DialogTitle>
            <DialogDescription>
              Al salir de la playlist el episodio se mueve solo a {program.playedFolder}.
            </DialogDescription>
          </DialogHeader>

          {loading && episodes.length === 0 ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, index) => (
                <Card key={index} className="animate-pulse border-border bg-muted/60">
                  <CardContent className="pt-4">
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : episodes.length === 0 ? (
            <Card className="border-border bg-muted/60">
              <CardContent className="pt-10 pb-10 text-center space-y-3">
                <ListMusic className="w-10 h-10 mx-auto text-faint" />
                <p className="text-faint">Todavía no hay episodios en este programa.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {episodes.map((episode) => (
                <Card key={episode.id} className="border-border">
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{episode.title}</p>
                        <p className="font-mono text-[11px] text-faint">
                          {episode.uploadDate}
                          {episode.durationSec ? ` · ${formatDuration(episode.durationSec)}` : ''}
                          {episode.relativePath ? ` · ${episode.relativePath}` : ''}
                        </p>
                      </div>
                      <Badge className={EPISODE_STATUS_CLASSES[episode.status]}>
                        {EPISODE_STATUS_LABELS[episode.status]}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {episode.reduceNoise && (
                        <Badge className="bg-muted text-muted-foreground">ruido reducido</Badge>
                      )}
                      {episode.normalizeLoudness && (
                        <Badge className="bg-muted text-muted-foreground">volumen normalizado</Badge>
                      )}
                    </div>

                    {previewUrls[episode.id] && (
                      <audio
                        src={previewUrls[episode.id]}
                        controls
                        preload="metadata"
                        className="w-full"
                      />
                    )}

                    {episode.errorMessage && (
                      <p className="flex items-start gap-1.5 text-xs text-warning">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {episode.errorMessage}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {episode.status === 'draft' &&
                        (program.scheduleMode === 'manual' ? (
                          <p className="text-xs text-faint">
                            Publícalo desde el diálogo de subida, donde eliges el día y la hora.
                          </p>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              className="gap-1.5"
                              disabled={busyId === episode.id}
                              onClick={() => void runAction(episode, () => publishProgramEpisode(episode.id))}
                            >
                              <Send className="w-3.5 h-3.5" />
                              Publicar
                            </Button>
                            {!previewUrls[episode.id] && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                disabled={busyId === episode.id}
                                onClick={() => void loadPreview(episode)}
                              >
                                <PlayCircle className="w-3.5 h-3.5" />
                                Escuchar
                              </Button>
                            )}
                          </>
                        ))}
                      {episode.status === 'queued' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={busyId === episode.id}
                          onClick={() =>
                            void runAction(episode, () => markProgramEpisodePlayed(episode.id))
                          }
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          Marcar emitido
                        </Button>
                      )}
                      {episode.status === 'played' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={busyId === episode.id}
                          onClick={() => void runAction(episode, () => requeueProgramEpisode(episode.id))}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Volver a la cola
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive"
                        disabled={busyId === episode.id}
                        onClick={() => setPendingDelete(episode)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Eliminar
                      </Button>
                      {busyId === episode.id && <Loader2 className="w-4 h-4 animate-spin text-faint" />}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => !next && setPendingDelete(null)}
        title="Eliminar episodio"
        description={
          pendingDelete
            ? `Se eliminará "${pendingDelete.title}" y su archivo de la biblioteca de AzuraCast.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={busyId === pendingDelete?.id}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}