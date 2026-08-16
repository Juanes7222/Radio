import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ListMusic, Power, Trash2, RefreshCw, Music2, ExternalLink, Plus, X, Info,
  GripVertical, ChevronUp, ChevronDown, Copy, CalendarDays, Search, Clock, Check,
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
import { formatDuration } from '@/lib/format';
import type { AdminPlaylist, MediaFile, PlaylistOrderEntry, PlaylistScheduleItem } from '@radio/types';

const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

const PLAYLIST_TYPES: Record<string, string> = {
  default: 'Estándar',
  scheduled: 'Programada',
  once: 'Una vez',
  on_request: 'Por solicitud',
};

const PLAYLIST_ORDERS: Record<string, string> = {
  shuffle: 'Aleatoria',
  sequential: 'Secuencial',
  random: 'Random ponderado',
};

const DAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DAY_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const LIBRARY_PAGE_CAP = 10;

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="text-xs shrink-0 text-slate-400 pt-0.5">{label}</span>
      <div className="text-xs text-right text-slate-200 min-w-0">{value}</div>
    </div>
  );
}

function PlaylistDetailDialog({
  playlist,
  onClose,
}: {
  playlist: AdminPlaylist | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={playlist !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{playlist?.name ?? 'Playlist'}</DialogTitle>
          <DialogDescription>Configuración completa de la playlist.</DialogDescription>
        </DialogHeader>
        {playlist && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 divide-y divide-slate-700/60">
            <DetailRow
              label="Estado"
              value={
                <Badge variant={playlist.is_enabled ? 'default' : 'secondary'} className="text-xs">
                  {playlist.is_enabled ? 'Activa' : 'Inactiva'}
                </Badge>
              }
            />
            <DetailRow label="Tipo" value={PLAYLIST_TYPES[playlist.type] ?? playlist.type} />
            <DetailRow label="Orden" value={PLAYLIST_ORDERS[playlist.order] ?? playlist.order} />
            <DetailRow label="Fuente" value={playlist.source} />
            <DetailRow label="Canciones" value={String(playlist.num_songs)} />
            <DetailRow label="Duración total" value={formatDuration(playlist.total_length)} />
            <DetailRow
              label="Reproducir cada N canciones"
              value={playlist.play_per_songs > 0 ? String(playlist.play_per_songs) : '—'}
            />
            <DetailRow
              label="Reproducir cada N minutos"
              value={playlist.play_per_minutes > 0 ? String(playlist.play_per_minutes) : '—'}
            />
            <DetailRow
              label="Solicitudes de oyentes"
              value={playlist.include_in_requests ? 'Permitidas' : 'No permitidas'}
            />
            <DetailRow
              label="Bajo demanda"
              value={playlist.include_in_on_demand ? 'Incluida' : 'No incluida'}
            />
            {playlist.remote_url && <DetailRow label="URL remota" value={playlist.remote_url} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlaylistContentDialog({
  playlist,
  onClose,
}: {
  playlist: AdminPlaylist;
  onClose: () => void;
}) {
  const { getPlaylistOrder, setPlaylistOrder, getMedia, getMediaFile, setFilePlaylists } = useAdminApi();

  const [media, setMedia] = useState<PlaylistOrderEntry[]>([]);
  const [canReorder, setCanReorder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reordering, setReordering] = useState(false);
  const [busyId, setBusyId] = useState<string | number | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [library, setLibrary] = useState<MediaFile[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Initial load. Follows the repo pattern: no synchronous setState inside
  // the effect body, cancellation flag to avoid state updates after unmount.
  useEffect(() => {
    let cancelled = false;

    getPlaylistOrder(playlist.id)
      .then((order) => {
        if (cancelled) return;
        setMedia(order);
        setCanReorder(playlist.order === 'sequential');
      })
      .catch(() => {
        if (cancelled) return;
        // Non-sequential playlists expose their content through the library only.
        setCanReorder(false);
        getMedia(1, 200)
          .then((files) => {
            if (cancelled) return;
            const rows = (files.rows ?? []) as MediaFile[];
            setMedia(
              rows
                .filter((file) => file.playlists?.some((p) => p.id === playlist.id))
                .map((file, index) => ({
                  id: index,
                  weight: index + 1,
                  media: {
                    id: Number(file.song_id ?? 0),
                    unique_id: file.unique_id,
                    path: file.path,
                    title: file.title,
                    artist: file.artist,
                    length: file.length,
                  },
                }))
            );
          })
          .catch(() => {
            if (!cancelled) setError('No se pudo cargar el contenido de la playlist.');
          });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [playlist, getPlaylistOrder, getMedia]);

  const reload = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const order = await getPlaylistOrder(playlist.id);
      setMedia(order);
      setCanReorder(playlist.order === 'sequential');
    } catch {
      setCanReorder(false);
      const files = await getMedia(1, 200);
      const rows = (files.rows ?? []) as MediaFile[];
      setMedia(
        rows
          .filter((file) => file.playlists?.some((p) => p.id === playlist.id))
          .map((file, index) => ({
            id: index,
            weight: index + 1,
            media: {
              id: Number(file.song_id ?? 0),
              unique_id: file.unique_id,
              path: file.path,
              title: file.title,
              artist: file.artist,
              length: file.length,
            },
          }))
      );
    } finally {
      setLoading(false);
    }
  }, [playlist, getPlaylistOrder, getMedia]);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const all: MediaFile[] = [];
      for (let page = 1; page <= LIBRARY_PAGE_CAP; page++) {
        const result = await getMedia(page, 100);
        const rows = result.rows ?? [];
        all.push(...rows);
        if (rows.length < 100) break;
      }
      setLibrary(all);
    } catch {
      setError('No se pudo cargar la biblioteca de audios.');
    } finally {
      setLibraryLoading(false);
    }
  }, [getMedia]);

  const toggleAdd = () => {
    setSearchText('');
    setShowAdd((visible) => {
      const next = !visible;
      if (next) void loadLibrary();
      return next;
    });
  };

  const isInPlaylist = (file: MediaFile): boolean =>
    media.some((row) => row.media.unique_id === file.unique_id);

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;
    const next = [...media];
    [next[index], next[target]] = [next[target], next[index]];
    setMedia(next);
    setReordering(true);
    setError('');
    try {
      const order: Record<number, number> = {};
      next.forEach((row, i) => { order[row.id] = i + 1; });
      await setPlaylistOrder(playlist.id, order);
    } catch {
      setError('No se pudo guardar el nuevo orden.');
      await reload();
    } finally {
      setReordering(false);
    }
  };

  const remove = async (row: PlaylistOrderEntry) => {
    setBusyId(row.media.unique_id);
    setError('');
    try {
      const file = await getMediaFile(row.media.unique_id);
      const remaining = file.playlists.map((p) => p.id).filter((id) => id !== playlist.id);
      await setFilePlaylists(row.media.unique_id, remaining);
      await reload();
    } catch {
      setError('No se pudo quitar el audio de la playlist.');
    } finally {
      setBusyId(null);
    }
  };

  const add = async (file: MediaFile) => {
    setBusyId(file.unique_id);
    setError('');
    try {
      const detail = await getMediaFile(file.unique_id);
      const ids = [...new Set([...detail.playlists.map((p) => p.id), playlist.id])];
      await setFilePlaylists(file.unique_id, ids);
      await reload();
    } catch {
      setError('No se pudo añadir el audio a la playlist.');
    } finally {
      setBusyId(null);
    }
  };

  const filteredResults = searchText.trim()
    ? library.filter((file) =>
        `${file.title} ${file.artist} ${file.path}`.toLowerCase().includes(searchText.trim().toLowerCase())
      )
    : library;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contenido de {playlist.name}</DialogTitle>
          <DialogDescription>
            {media.length} audios · orden {PLAYLIST_ORDERS[playlist.order] ?? playlist.order}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            {canReorder
              ? 'Usa las flechas para reordenar. Los cambios se guardan al instante.'
              : 'Esta playlist no es secuencial, por lo que no se puede reordenar desde aquí.'}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={toggleAdd} disabled={loading}>
              {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showAdd ? 'Cerrar' : 'Añadir audio'}
            </Button>
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {showAdd && (
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                placeholder="Buscar en la biblioteca por título, artista o ruta..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="bg-slate-950 border-slate-600 pl-9"
              />
            </div>
            {libraryLoading ? (
              <p className="text-xs text-slate-400 animate-pulse">Cargando biblioteca...</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filteredResults.slice(0, 30).map((file) => (
                  <div
                    key={file.unique_id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{file.title || file.path}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {file.artist || '—'} · {formatDuration(file.length)}
                      </p>
                    </div>
                    {isInPlaylist(file) ? (
                      <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                        <Check className="w-3 h-3" /> En la playlist
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-xs gap-1"
                        disabled={busyId === file.unique_id}
                        onClick={() => void add(file)}
                      >
                        <Plus className="w-3 h-3" />
                        Añadir
                      </Button>
                    )}
                  </div>
                ))}
                {filteredResults.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-4">
                    No hay audios que coincidan con la búsqueda.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse bg-slate-800" />
            ))}
          </div>
        ) : media.length === 0 ? (
          <div className="rounded-lg border border-slate-700 bg-slate-900 py-8 text-center space-y-2">
            <Music2 className="w-8 h-8 mx-auto text-slate-500" />
            <p className="text-sm text-slate-400">Esta playlist no tiene audios.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-700 divide-y divide-slate-700/60 overflow-hidden">
            {media.map((row, index) => (
              <div key={`${row.media.unique_id}-${row.id}`} className="flex items-center gap-2 px-3 py-2 bg-slate-900">
                <span className="w-6 text-center text-xs text-slate-500 shrink-0">{index + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{row.media.title || row.media.path}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {row.media.artist || '—'} · {formatDuration(row.media.length)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canReorder && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-white"
                        disabled={index === 0 || reordering}
                        onClick={() => void move(index, -1)}
                        title="Subir"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-white"
                        disabled={index === media.length - 1 || reordering}
                        onClick={() => void move(index, 1)}
                        title="Bajar"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={busyId === row.media.unique_id}
                    onClick={() => void remove(row)}
                    title="Quitar de la playlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlaylistScheduleDialog({
  playlist,
  onClose,
}: {
  playlist: AdminPlaylist;
  onClose: () => void;
}) {
  const { getPlaylistDetail, updatePlaylist } = useAdminApi();

  const [items, setItems] = useState<PlaylistScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('07:00');

  useEffect(() => {
    let cancelled = false;
    getPlaylistDetail(playlist.id)
      .then((detail) => {
        if (!cancelled) setItems(detail.schedule_items ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudo cargar el horario de la playlist.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [playlist, getPlaylistDetail]);

  const toggleDay = (day: number) => {
    setDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day]
    );
  };

  const addItem = () => {
    setError('');
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (start === null || end === null || end <= start) {
      setError('Horario inválido: la hora final debe ser posterior a la inicial.');
      return;
    }
    if (days.length === 0) {
      setError('Selecciona al menos un día para el bloque.');
      return;
    }
    setItems((current) => [...current, { start_time: start, end_time: end, days: [...days].sort() }]);
    setDays([]);
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await updatePlaylist(playlist.id, { schedule_items: items });
      onClose();
    } catch {
      setError('No se pudo guardar el horario. Revisa que los horarios no se solapen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Horario de {playlist.name}</DialogTitle>
          <DialogDescription>
            Los días y horas en que esta playlist se emite. Los cambios se guardan con el botón Guardar.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse bg-slate-800" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-400 rounded-lg border border-slate-700 bg-slate-900 py-6 text-center">
            Esta playlist no tiene horario configurado.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={`${item.id ?? index}-${item.start_time}`}
                className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5"
              >
                <Clock className="w-4 h-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {minutesToTime(item.start_time)} → {minutesToTime(item.end_time)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {item.days
                      .slice()
                      .sort((a, b) => a - b)
                      .map((day) => (
                        <span key={day} title={DAY_FULL[day - 1]} className="mr-1.5 last:mr-0">
                          {DAY_SHORT[day - 1]}
                        </span>
                      ))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeItem(index)}
                  title="Quitar bloque"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-3">
          <p className="text-xs font-medium text-slate-300">Nuevo bloque</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_FULL.map((dayLabel, index) => {
              const day = index + 1;
              const selected = days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title={dayLabel}
                >
                  {DAY_SHORT[index]}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-32 bg-slate-950 border-slate-600" />
            <span className="text-slate-500">→</span>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-32 bg-slate-950 border-slate-600" />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={addItem}>
              <Plus className="w-3.5 h-3.5" />
              Agregar bloque
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar horario'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPlaylists() {
  const { getPlaylists, createPlaylist, togglePlaylist, deletePlaylist, clonePlaylist } = useAdminApi();

  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    type: 'default',
    is_enabled: true,
    include_in_requests: false,
    order: 'shuffle',
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<AdminPlaylist | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<AdminPlaylist | null>(null);
  const [contentPlaylist, setContentPlaylist] = useState<AdminPlaylist | null>(null);
  const [schedulePlaylist, setSchedulePlaylist] = useState<AdminPlaylist | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getPlaylists();
      setPlaylists(data as AdminPlaylist[]);
    } finally {
      setLoading(false);
    }
  }, [getPlaylists]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async (id: number) => {
    setActionId(id);
    try {
      await togglePlaylist(id);
      await load();
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setPendingDelete(null);
    setActionId(id);
    try {
      await deletePlaylist(id);
      await load();
    } finally {
      setActionId(null);
    }
  };

  const handleClone = async (playlist: AdminPlaylist) => {
    setActionId(playlist.id);
    try {
      await clonePlaylist(playlist.id);
      await load();
    } catch {
      // Cloning can fail when the API key lacks permissions; surface nothing extra.
    } finally {
      setActionId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) { setCreateError('El nombre es obligatorio.'); return; }
    setCreateLoading(true);
    setCreateError('');
    try {
      await createPlaylist(createForm);
      setCreateForm({ name: '', type: 'default', is_enabled: true, include_in_requests: false, order: 'shuffle' });
      setShowCreateForm(false);
      await load();
    } catch {
      setCreateError('No se pudo crear la playlist. Verifica que tu clave API tenga permisos.');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Playlists</h1>
          <p className="text-sm mt-0.5 text-slate-400">
            {playlists.length} playlist{playlists.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowCreateForm((v) => !v)}>
            {showCreateForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showCreateForm ? 'Cancelar' : 'Nueva playlist'}
          </Button>
        </div>
      </div>

      {/* Formulario crear playlist */}
      {showCreateForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-primary/40 bg-slate-800/60">
            <CardHeader>
              <CardTitle className="text-base">Nueva playlist</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-medium">Nombre *</label>
                    <Input
                      placeholder="Ej: Música cristiana"
                      value={createForm.name}
                      onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                      className="bg-slate-900 border-slate-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Tipo</label>
                    <Select
                      value={createForm.type}
                      onValueChange={(v) => setCreateForm((f) => ({ ...f, type: v }))}
                    >
                      <SelectTrigger className="w-full bg-slate-900 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PLAYLIST_TYPES).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Orden de reproducción</label>
                    <Select
                      value={createForm.order}
                      onValueChange={(v) => setCreateForm((f) => ({ ...f, order: v }))}
                    >
                      <SelectTrigger className="w-full bg-slate-900 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PLAYLIST_ORDERS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_enabled"
                      checked={createForm.is_enabled}
                      onChange={(e) => setCreateForm((f) => ({ ...f, is_enabled: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <label htmlFor="is_enabled" className="text-sm">Activa al crear</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="include_requests"
                      checked={createForm.include_in_requests}
                      onChange={(e) => setCreateForm((f) => ({ ...f, include_in_requests: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <label htmlFor="include_requests" className="text-sm">Permitir solicitudes de oyentes</label>
                  </div>
                </div>
                {createError && <p className="text-xs text-destructive">{createError}</p>}
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={createLoading}>
                    {createLoading ? 'Creando...' : 'Crear playlist'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {loading && playlists.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse border-slate-700 bg-slate-800/60">
              <CardContent className="pt-6 space-y-3">
                <div className="h-4 rounded bg-slate-700" />
                <div className="h-3 w-2/3 rounded bg-slate-700" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <Card className="border-slate-700 bg-slate-800/60">
          <CardContent className="pt-10 pb-10 text-center space-y-3">
            <ListMusic className="w-10 h-10 mx-auto text-slate-400" />
            <p className="text-slate-400">
              No hay playlists configuradas.
            </p>
            <a href={`${AZURACAST_URL}/station/1/playlists`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Gestionar en AzuraCast
              </Button>
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((pl, i) => (
            <motion.div
              key={pl.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card
                className={`h-full transition-opacity ${
                  !pl.is_enabled ? 'opacity-50' : ''
                } border-slate-700 bg-slate-800/60`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Music2 className="w-4 h-4 text-primary shrink-0" />
                      <CardTitle className="text-sm font-semibold truncate">{pl.name}</CardTitle>
                    </div>
                    <Badge
                      variant={pl.is_enabled ? 'default' : 'secondary'}
                      className="shrink-0 text-xs"
                    >
                      {pl.is_enabled ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                    <span>{PLAYLIST_TYPES[pl.type] ?? pl.type}</span>
                    <span>·</span>
                    <span>{pl.num_songs} canciones</span>
                    <span>·</span>
                    <span>{formatDuration(pl.total_length)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={actionId === pl.id}
                      onClick={() => handleToggle(pl.id)}
                    >
                      <Power className="w-3 h-3" />
                      {pl.is_enabled ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={actionId === pl.id}
                      onClick={() => setContentPlaylist(pl)}
                    >
                      <GripVertical className="w-3 h-3" />
                      Contenido
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={actionId === pl.id}
                      onClick={() => setSchedulePlaylist(pl)}
                    >
                      <CalendarDays className="w-3 h-3" />
                      Horario
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      disabled={actionId === pl.id}
                      onClick={() => void handleClone(pl)}
                      title="Duplicar playlist"
                    >
                      <Copy className="w-3 h-3" />
                      Duplicar
                    </Button>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-white"
                      disabled={actionId === pl.id}
                      onClick={() => setSelectedPlaylist(pl)}
                      title="Ver detalles"
                    >
                      <Info className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={actionId === pl.id}
                      onClick={() => setPendingDelete(pl)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `¿Eliminar la playlist "${pendingDelete.name}"?` : 'Eliminar playlist'}
        description="Esta acción no se puede deshacer. Las canciones de la playlist no se eliminarán, solo la configuración."
        confirmLabel="Eliminar"
        loading={actionId !== null}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete.id)}
      />

      <PlaylistDetailDialog playlist={selectedPlaylist} onClose={() => setSelectedPlaylist(null)} />
      {contentPlaylist && (
        <PlaylistContentDialog
          key={contentPlaylist.id}
          playlist={contentPlaylist}
          onClose={() => setContentPlaylist(null)}
        />
      )}
      {schedulePlaylist && (
        <PlaylistScheduleDialog
          key={schedulePlaylist.id}
          playlist={schedulePlaylist}
          onClose={() => setSchedulePlaylist(null)}
        />
      )}
    </div>
  );
}
