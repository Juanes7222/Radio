import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, Plus, Trash2, Play, History, Pencil, Repeat, BookOpen,
  Bell, ArrowRight, Clock, FolderOpen, Folder, ChevronUp, Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { apiUrl } from '@/config';
import { formatChapters } from '@/lib/format';
import type { BibleTranslation, PlaylistRotation, RotationRunLog, RotationRunResult } from '@radio/types';

const STATUS_LABELS: Record<string, string> = {
  success: 'Correcta',
  partial: 'Parcial',
  error: 'Error',
};

interface RunDetails {
  titles?: string[];
  chapters?: { ordinal: number; book: string; chapter: number }[];
  errors?: string[];
}

function parseRunDetails(run: RotationRunLog): RunDetails {
  try {
    return JSON.parse(run.details ?? '{}') as RunDetails;
  } catch {
    return {};
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Nunca';
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FolderBrowserDialog({
  currentPath,
  onClose,
  onSelect,
}: {
  currentPath: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const { getMediaDirectories } = useAdminApi();
  const [currentDir, setCurrentDir] = useState(currentPath);
  const [rows, setRows] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getMediaDirectories(currentDir)
      .then((data) => {
        if (!cancelled) setRows(data.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo leer la carpeta de la biblioteca.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentDir, getMediaDirectories]);

  const goUp = () => {
    setError('');
    setLoading(true);
    const index = currentDir.lastIndexOf('/');
    setCurrentDir(index > 0 ? currentDir.slice(0, index) : '');
  };

  const openFolder = (path: string) => {
    setError('');
    setLoading(true);
    setCurrentDir(path);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Explorar biblioteca</DialogTitle>
          <DialogDescription>
            Navega hasta la carpeta con los audios y usa "Elegir esta carpeta".
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <FolderOpen className="w-4 h-4 text-primary shrink-0" />
            <p className="flex-1 min-w-0 text-xs text-muted-foreground truncate" title={currentDir}>
              {currentDir || '(raíz de la biblioteca)'}
            </p>
            {currentDir && (
              <Button variant="ghost" size="sm" className="gap-1 text-xs shrink-0" onClick={goUp}>
                <ChevronUp className="w-3.5 h-3.5" />
                Subir
              </Button>
            )}
          </div>
          <div className="px-3 py-2.5 max-h-64 overflow-y-auto space-y-1">
            {loading ? (
              <p className="text-xs text-faint animate-pulse">Cargando carpetas...</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-faint py-3 text-center">
                Esta carpeta no tiene subcarpetas.
              </p>
            ) : (
              rows.map((row) => (
                <div key={row.path} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                  <button
                    type="button"
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    onClick={() => openFolder(row.path)}
                    title={row.path}
                  >
                    <Folder className="w-4 h-4 text-faint shrink-0" />
                    <span className="text-sm truncate">{row.name}</span>
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs gap-1"
                    onClick={() => onSelect(row.path)}
                  >
                    <Check className="w-3 h-3" />
                    Elegir
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-faint truncate">
            {currentDir ? `Ruta: ${currentDir}` : 'Raíz de la biblioteca'}
          </p>
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={!currentDir}
            onClick={() => onSelect(currentDir)}
          >
            <Check className="w-3.5 h-3.5" />
            Elegir esta carpeta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY_FORM = {
  name: '',
  sourceType: 'playlist' as 'playlist' | 'folder',
  sourcePlaylistId: '',
  sourceFolder: '',
  targetPlaylistId: '',
  itemsPerDay: '7',
  loop: true,
  active: true,
  bibleMode: false,
  translation: 'RVR1960',
  bibleStartOrdinal: '1',
  notifyEnabled: false,
  notifyProgram: '',
};

function initialForm(rotation: PlaylistRotation | null): typeof EMPTY_FORM {
  if (!rotation) return EMPTY_FORM;
  return {
    name: rotation.name,
    sourceType: rotation.sourceType,
    sourcePlaylistId: String(rotation.sourcePlaylistId),
    sourceFolder: rotation.sourceFolder ?? '',
    targetPlaylistId: String(rotation.targetPlaylistId),
    itemsPerDay: String(rotation.itemsPerDay),
    loop: rotation.loop,
    active: rotation.active,
    bibleMode: rotation.bibleMode,
    translation: rotation.translation ?? 'RVR1960',
    bibleStartOrdinal: String(rotation.bibleStartOrdinal),
    notifyEnabled: rotation.notifyEnabled,
    notifyProgram: rotation.notifyProgram ?? '',
  };
}

function RotationFormDialog({
  rotation,
  playlists,
  translations,
  onClose,
  onSaved,
}: {
  rotation: PlaylistRotation | null;
  playlists: { id: number; name: string }[];
  translations: BibleTranslation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { createRotation, updateRotation } = useAdminApi();

  const [form, setForm] = useState(() => initialForm(rotation));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!form.targetPlaylistId) { setError('Selecciona la playlist destino.'); return; }
    if (form.sourceType === 'folder') {
      if (!form.sourceFolder.trim()) { setError('Indica la carpeta de la biblioteca de la fuente.'); return; }
    } else {
      if (!form.sourcePlaylistId) { setError('Selecciona la playlist fuente.'); return; }
      if (form.sourcePlaylistId === form.targetPlaylistId) { setError('La playlist fuente y la destino deben ser distintas.'); return; }
    }
    if (form.bibleMode && form.notifyEnabled && !form.notifyProgram.trim()) {
      setError('Indica el nombre del programa para las notificaciones push.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sourceType: form.sourceType,
        sourcePlaylistId: form.sourceType === 'playlist' ? Number(form.sourcePlaylistId) : 0,
        sourceFolder: form.sourceType === 'folder' ? form.sourceFolder.trim() : null,
        targetPlaylistId: Number(form.targetPlaylistId),
        itemsPerDay: Number(form.itemsPerDay),
        loop: form.loop,
        active: form.active,
        bibleMode: form.bibleMode,
        translation: form.bibleMode ? form.translation : null,
        bibleStartOrdinal: Number(form.bibleStartOrdinal),
        notifyEnabled: form.bibleMode && form.notifyEnabled,
        notifyProgram: form.bibleMode && form.notifyEnabled ? form.notifyProgram : null,
      };
      if (rotation) {
        await updateRotation(rotation.id, payload);
      } else {
        await createRotation(payload);
      }
      onSaved();
      onClose();
    } catch {
      setError('No se pudo guardar la rotación.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rotation ? 'Editar rotación' : 'Nueva rotación'}</DialogTitle>
          <DialogDescription>
            Cada día se copian los siguientes audios de la playlist fuente a la playlist destino, en orden.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">Nombre *</label>
            <Input
              placeholder="Ej: Lectura bíblica diaria"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-card border-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Tipo de fuente</label>
              <Select
                value={form.sourceType}
                onValueChange={(v) => setForm((f) => ({ ...f, sourceType: v as 'playlist' | 'folder' }))}
              >
                <SelectTrigger className="w-full bg-card border-input"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="playlist">Playlist de AzuraCast</SelectItem>
                  <SelectItem value="folder">Carpeta de la biblioteca</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.sourceType === 'folder' ? (
              <div className="space-y-1">
                <label className="text-xs font-medium">Carpeta fuente (biblioteca)</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ej: Biblia/Capítulos"
                    value={form.sourceFolder}
                    onChange={(e) => setForm((f) => ({ ...f, sourceFolder: e.target.value }))}
                    className="flex-1 bg-card border-input"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setBrowserOpen(true)}
                    title="Explorar carpetas"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[11px] text-faint">
                  Los audios de la carpeta (y sus subcarpetas) se toman en orden alfabético.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-medium">Playlist fuente (material ordenado)</label>
                <Select
                  value={form.sourcePlaylistId}
                  onValueChange={(v) => setForm((f) => ({ ...f, sourcePlaylistId: v }))}
                >
                  <SelectTrigger className="w-full bg-card border-input"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {playlists.map((pl) => (
                      <SelectItem key={pl.id} value={String(pl.id)}>{pl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium">Playlist destino (la que se reproduce)</label>
              <Select
                value={form.targetPlaylistId}
                onValueChange={(v) => setForm((f) => ({ ...f, targetPlaylistId: v }))}
              >
                <SelectTrigger className="w-full bg-card border-input"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {playlists.map((pl) => (
                    <SelectItem key={pl.id} value={String(pl.id)}>{pl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Audios por día</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.itemsPerDay}
                onChange={(e) => setForm((f) => ({ ...f, itemsPerDay: e.target.value }))}
                className="bg-card border-input"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Ordinal inicial (solo bíblico)</label>
              <Input
                type="number"
                min={1}
                value={form.bibleStartOrdinal}
                disabled={!form.bibleMode}
                onChange={(e) => setForm((f) => ({ ...f, bibleStartOrdinal: e.target.value }))}
                className="bg-card border-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.loop}
                onChange={(e) => setForm((f) => ({ ...f, loop: e.target.checked }))}
                className="w-4 h-4"
              />
              Reiniciar al llegar al final
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="w-4 h-4"
              />
              Activa
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.bibleMode}
                onChange={(e) => setForm((f) => ({ ...f, bibleMode: e.target.checked }))}
                className="w-4 h-4"
              />
              Es una lectura bíblica (publica la lectura del día)
            </label>
            {form.bibleMode && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.notifyEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, notifyEnabled: e.target.checked }))}
                  className="w-4 h-4"
                />
                Notificar a suscriptores del programa
              </label>
            )}
          </div>

          {form.bibleMode && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Traducción</label>
                <Select
                  value={form.translation}
                  onValueChange={(v) => setForm((f) => ({ ...f, translation: v }))}
                >
                  <SelectTrigger className="w-full bg-sunken border-input"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {translations.map((t) => (
                      <SelectItem key={t.abbreviation} value={t.abbreviation}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Programa para notificar</label>
                <Input
                  placeholder="Ej: Lectura Bíblica"
                  value={form.notifyProgram}
                  disabled={!form.notifyEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, notifyProgram: e.target.value }))}
                  className="bg-sunken border-input"
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Guardando...' : rotation ? 'Guardar cambios' : 'Crear rotación'}
            </Button>
          </div>
        </form>
      </DialogContent>

      {browserOpen && (
        <FolderBrowserDialog
          currentPath={form.sourceFolder}
          onClose={() => setBrowserOpen(false)}
          onSelect={(path) => {
            setForm((f) => ({ ...f, sourceFolder: path }));
            setBrowserOpen(false);
          }}
        />
      )}
    </Dialog>
  );
}

function RotationHistoryDialog({
  rotation,
  onClose,
}: {
  rotation: PlaylistRotation;
  onClose: () => void;
}) {
  const { getRotationRuns } = useAdminApi();
  const [runs, setRuns] = useState<RotationRunLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRotationRuns(rotation.id)
      .then((data) => {
        if (!cancelled) setRuns(data);
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [rotation, getRotationRuns]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de {rotation.name}</DialogTitle>
          <DialogDescription>Ejecuciones registradas y capítulos colocados.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg animate-pulse bg-muted" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-faint rounded-lg border border-border bg-card py-6 text-center">
            Aún no hay ejecuciones registradas.
          </p>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => {
              const details = parseRunDetails(run);
              return (
                <div key={run.id} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {new Date(run.runDate).toLocaleString('es-CO', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                    <Badge
                      variant={run.status === 'success' ? 'default' : run.status === 'partial' ? 'secondary' : 'destructive'}
                      className="text-[10px]"
                    >
                      {STATUS_LABELS[run.status] ?? run.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-faint">
                    {run.itemsPlaced} de {run.itemsPicked} audios colocados
                  </p>
                  {details.chapters && details.chapters.length > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <BookOpen className="w-3 h-3 text-primary shrink-0" />
                      {formatChapters(details.chapters)}
                    </p>
                  )}
                  {details.errors && details.errors.length > 0 && (
                    <ul className="text-[11px] text-destructive/90 list-disc pl-4 space-y-0.5">
                      {details.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminRotations() {
  const { getRotations, getPlaylists, deleteRotation, runRotation } = useAdminApi();

  const [rotations, setRotations] = useState<PlaylistRotation[]>([]);
  const [playlists, setPlaylists] = useState<{ id: number; name: string }[]>([]);
  const [translations, setTranslations] = useState<BibleTranslation[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlaylistRotation | null>(null);
  const [historyRotation, setHistoryRotation] = useState<PlaylistRotation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlaylistRotation | null>(null);

  const load = useCallback(async () => {
    try {
      const [rotationsData, playlistsData] = await Promise.all([getRotations(), getPlaylists()]);
      setRotations(rotationsData);
      setPlaylists(playlistsData as { id: number; name: string }[]);
    } finally {
      setLoading(false);
    }
  }, [getRotations, getPlaylists]);

  useEffect(() => {
    void load();
    fetch(`${apiUrl('/api/bible')}/translations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: BibleTranslation[]) => setTranslations(Array.isArray(data) ? data : []))
      .catch(() => setTranslations([]));
  }, [load]);

  const handleRun = async (rotation: PlaylistRotation) => {
    setRunningId(rotation.id);
    setRunMessage(null);
    try {
      const result: RotationRunResult = await runRotation(rotation.id);
      const status = STATUS_LABELS[result.status] ?? result.status;
      const chapters = result.chapters.length > 0 ? ` · ${formatChapters(result.chapters)}` : '';
      setRunMessage(
        `${rotation.name}: ${status} (${result.itemsPlaced}/${result.itemsPicked})${chapters}`
      );
      await load();
    } catch {
      setRunMessage(`No se pudo ejecutar ${rotation.name}.`);
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async (rotation: PlaylistRotation) => {
    setPendingDelete(null);
    try {
      await deleteRotation(rotation.id);
      await load();
    } catch {
      // Keep the list as-is when deletion fails.
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rotaciones</h1>
          <p className="text-sm mt-0.5 text-faint">
            Playlists que se reconstruyen solas cada día con los siguientes audios de una playlist fuente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4" />
            Nueva rotación
          </Button>
        </div>
      </div>

      {runMessage && (
        <p className="text-xs text-muted-foreground rounded-lg border border-border bg-card px-3 py-2">
          {runMessage}
        </p>
      )}

      {loading && rotations.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse border-border bg-muted/60">
              <CardContent className="pt-6 space-y-3">
                <div className="h-4 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : rotations.length === 0 ? (
        <Card className="border-border bg-muted/60">
          <CardContent className="pt-10 pb-10 text-center space-y-3">
            <Repeat className="w-10 h-10 mx-auto text-faint" />
            <p className="text-faint">
              No hay rotaciones configuradas. Crea una para automatizar la lectura bíblica u otra rotación diaria.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rotations.map((rotation, index) => (
            <motion.div
              key={rotation.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <Card className={`h-full border-border bg-muted/60 ${!rotation.active ? 'opacity-50' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Repeat className="w-4 h-4 text-primary shrink-0" />
                      <CardTitle className="text-sm font-semibold truncate">{rotation.name}</CardTitle>
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0">
                      <Badge variant={rotation.active ? 'default' : 'secondary'} className="text-[10px]">
                        {rotation.active ? 'Activa' : 'Inactiva'}
                      </Badge>
                      {rotation.bibleMode && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <BookOpen className="w-3 h-3" /> Bíblica
                        </Badge>
                      )}
                      {rotation.notifyEnabled && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Bell className="w-3 h-3" /> Notifica
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-faint flex items-center gap-1.5">
                    <FolderOpen className="w-3 h-3 text-faint shrink-0" />
                    {rotation.sourceType === 'folder' ? (
                      <span className="truncate" title={rotation.sourceFolder ?? ''}>
                        {rotation.sourceFolder ?? 'Carpeta sin definir'}
                      </span>
                    ) : (
                      <span className="truncate">
                        {playlists.find((p) => p.id === rotation.sourcePlaylistId)?.name ?? `#${rotation.sourcePlaylistId}`}
                      </span>
                    )}
                    <ArrowRight className="w-3 h-3 shrink-0" />
                    <span className="truncate">
                      {playlists.find((p) => p.id === rotation.targetPlaylistId)?.name ?? `#${rotation.targetPlaylistId}`}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-faint">
                    <span>{rotation.itemsPerDay} audios/día</span>
                    <span>·</span>
                    <span>posición {rotation.cursor}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDateTime(rotation.lastRunAt)}
                    </span>
                  </div>
                  {rotation.runs && rotation.runs[0] && (
                    <p className="text-[11px] text-faint">
                      Última ejecución:{' '}
                      <Badge
                        variant={rotation.runs[0].status === 'success' ? 'default' : rotation.runs[0].status === 'partial' ? 'secondary' : 'destructive'}
                        className="text-[10px]"
                      >
                        {STATUS_LABELS[rotation.runs[0].status] ?? rotation.runs[0].status}
                      </Badge>{' '}
                      · {rotation.runs[0].itemsPlaced}/{rotation.runs[0].itemsPicked}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={runningId === rotation.id}
                      onClick={() => void handleRun(rotation)}
                    >
                      <Play className="w-3 h-3" />
                      {runningId === rotation.id ? 'Ejecutando...' : 'Ejecutar ahora'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => setHistoryRotation(rotation)}
                    >
                      <History className="w-3 h-3" />
                      Historial
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => { setEditing(rotation); setFormOpen(true); }}
                    >
                      <Pencil className="w-3 h-3" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setPendingDelete(rotation)}
                    >
                      <Trash2 className="w-3 h-3" />
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
        <RotationFormDialog
          key={editing?.id ?? 'new'}
          rotation={editing}
          playlists={playlists}
          translations={translations}
          onClose={() => setFormOpen(false)}
          onSaved={() => void load()}
        />
      )}

      {historyRotation && (
        <RotationHistoryDialog
          key={historyRotation.id}
          rotation={historyRotation}
          onClose={() => setHistoryRotation(null)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `¿Eliminar la rotación "${pendingDelete.name}"?` : 'Eliminar rotación'}
        description="La rotación se eliminará y no volverá a actualizar la playlist destino. El contenido actual de la playlist no se borra."
        confirmLabel="Eliminar"
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete)}
      />
    </div>
  );
}
