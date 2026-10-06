import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarClock,
  ListMusic,
  Loader2,
  Mic2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { toast } from 'sonner';
import type { Program } from '@radio/types';
import { ProgramFormDialog } from './programs/ProgramFormDialog';
import { ProgramEpisodesDialog } from './programs/ProgramEpisodesDialog';
import { EpisodeUploadDialog } from './programs/EpisodeUploadDialog';
import { SCHEDULE_MODE_LABELS, errorMessage } from './programs/shared';

export default function AdminPrograms() {
  const { getPrograms, deleteProgram, syncProgram } = useAdminApi();

  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [episodesOf, setEpisodesOf] = useState<Program | null>(null);
  const [uploadTo, setUploadTo] = useState<Program | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Program | null>(null);

  const load = useCallback(async () => {
    try {
      const { programs: rows } = await getPrograms();
      setPrograms(rows);
    } catch (err) {
      setMessage(errorMessage(err, 'No se pudieron cargar los programas.'));
    } finally {
      setLoading(false);
    }
  }, [getPrograms]);

  useEffect(() => {
    let cancelled = false;
    getPrograms()
      .then(({ programs: rows }) => {
        if (cancelled) return;
        setPrograms(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMessage(errorMessage(err, 'No se pudieron cargar los programas.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getPrograms]);

  const handleSync = async (program: Program) => {
    setBusyId(program.id);
    setMessage(null);
    try {
      const result = await syncProgram(program.id);
      setMessage(
        `${program.name}: ${result.archived} de ${result.checked} archivados${
          result.errors.length > 0 ? ` · ${result.errors.length} con error` : ''
        }.`
      );
      await load();
    } catch (err) {
      setMessage(errorMessage(err, 'No se pudo sincronizar el programa.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const program = pendingDelete;
    setPendingDelete(null);
    setBusyId(program.id);
    try {
      await deleteProgram(program.id);
      await load();
      toast.success('Programa eliminado.');
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo eliminar el programa.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Programas</h1>
          <p className="text-sm mt-0.5 text-faint">
            Sube el audio de un episodio y la estación compone la intro y el outro, aplica los metadatos del
            programa, lo encola una vez y lo archiva al terminar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Nuevo programa
          </Button>
        </div>
      </div>

      {message && (
        <p className="text-xs text-muted-foreground rounded-lg border border-border bg-card px-3 py-2">
          {message}
        </p>
      )}

      {loading && programs.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, index) => (
            <Card key={index} className="animate-pulse border-border bg-muted/60">
              <CardContent className="pt-6 space-y-3">
                <div className="h-4 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : programs.length === 0 ? (
        <Card className="border-border bg-muted/60">
          <CardContent className="pt-10 pb-10 text-center space-y-3">
            <Mic2 className="w-10 h-10 mx-auto text-faint" />
            <p className="text-faint">
              Todavía no hay programas. Crea uno para automatizar la emisión de las personas invitadas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {programs.map((program, index) => (
            <motion.div
              key={program.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <Card className="border-border h-full">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-3">
                    <div className="w-14 h-14 shrink-0 overflow-hidden rounded-lg border border-border bg-sunken">
                      {program.artUrl ? (
                        <img src={program.artUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-faint">
                          <Mic2 className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold truncate">{program.name}</h2>
                        {!program.active && <Badge className="bg-muted text-muted-foreground">Inactivo</Badge>}
                      </div>
                      <p className="text-xs text-faint truncate">
                        {program.playlistName ?? `Playlist #${program.playlistId}`}
                      </p>
                      <p className="font-mono text-[11px] text-faint mt-0.5 truncate">
                        {program.folderName} / {program.pendingFolder}
                      </p>
                    </div>
                  </div>

                  {program.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{program.description}</p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    <Badge className="bg-primary/10 text-primary gap-1.5">
                      <CalendarClock className="w-3 h-3" />
                      {SCHEDULE_MODE_LABELS[program.scheduleMode]}
                    </Badge>
                    <Badge className="bg-muted text-muted-foreground">
                      {program.counts.queued} en cola
                    </Badge>
                    {program.counts.draft > 0 && (
                      <Badge className="bg-info/10 text-info">
                        {program.counts.draft} sin publicar
                      </Badge>
                    )}
                    <Badge className="bg-success/10 text-success">{program.counts.played} emitidos</Badge>
                    {program.counts.failed > 0 && (
                      <Badge className="bg-destructive/10 text-destructive">
                        {program.counts.failed} fallidos
                      </Badge>
                    )}
                    {program.hasIntro && <Badge className="bg-muted text-muted-foreground">intro</Badge>}
                    {program.hasOutro && <Badge className="bg-muted text-muted-foreground">outro</Badge>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="gap-2"
                      disabled={!program.active}
                      onClick={() => setUploadTo(program)}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Subir episodio
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setEpisodesOf(program)}>
                      <ListMusic className="w-3.5 h-3.5" />
                      Episodios
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        setEditing(program);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      disabled={busyId === program.id}
                      onClick={() => void handleSync(program)}
                    >
                      {busyId === program.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Sincronizar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive"
                      onClick={() => setPendingDelete(program)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {formOpen && (
        <ProgramFormDialog
          open={formOpen}
          program={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => void load()}
        />
      )}

      {episodesOf && (
        <ProgramEpisodesDialog
          open
          program={episodesOf}
          onClose={() => setEpisodesOf(null)}
          onChanged={() => void load()}
        />
      )}

      {uploadTo && (
        <EpisodeUploadDialog
          open
          program={uploadTo}
          onClose={() => setUploadTo(null)}
          onUploaded={() => void load()}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => !next && setPendingDelete(null)}
        title="Eliminar programa"
        description={
          pendingDelete
            ? `Se eliminará "${pendingDelete.name}". Los archivos ya subidos a AzuraCast permanecen en la biblioteca.`
            : ''
        }
        confirmLabel="Eliminar"
        loading={busyId === pendingDelete?.id}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}