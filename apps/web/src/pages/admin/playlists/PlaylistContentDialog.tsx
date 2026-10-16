import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw, Music2, Plus, X, Check, Search, ChevronUp, ChevronDown, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatDuration } from '@/lib/format';
import type { AdminPlaylist, MediaFile, PlaylistOrderEntry } from '@radio/types';
import { PLAYLIST_ORDERS } from './playlistLabels';

const LIBRARY_PAGE_CAP = 10;

/**
 * Playlist content editor: reorders sequential playlists and adds or removes
 * files from the media library.
 */
export default function PlaylistContentDialog({
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
          <p className="text-xs text-faint">
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
          <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <Input
                placeholder="Buscar en la biblioteca por título, artista o ruta..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="bg-sunken border-input pl-9"
              />
            </div>
            {libraryLoading ? (
              <p className="text-xs text-faint animate-pulse">Cargando biblioteca...</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1">
                {filteredResults.slice(0, 30).map((file) => (
                  <div
                    key={file.unique_id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{file.title || file.path}</p>
                      <p className="text-[11px] text-faint truncate">
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
                  <p className="text-xs text-faint text-center py-4">
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
              <div key={i} className="h-12 rounded-lg animate-pulse bg-muted" />
            ))}
          </div>
        ) : media.length === 0 ? (
          <div className="rounded-lg border border-border bg-card py-8 text-center space-y-2">
            <Music2 className="w-8 h-8 mx-auto text-faint" />
            <p className="text-sm text-faint">Esta playlist no tiene audios.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
            {media.map((row, index) => (
              <div key={`${row.media.unique_id}-${row.id}`} className="flex items-center gap-2 px-3 py-2 bg-card">
                <span className="w-6 text-center text-xs text-faint shrink-0">{index + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{row.media.title || row.media.path}</p>
                  <p className="text-[11px] text-faint truncate">
                    {row.media.artist || '—'} · {formatDuration(row.media.length)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canReorder && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-faint hover:text-foreground"
                        disabled={index === 0 || reordering}
                        onClick={() => void move(index, -1)}
                        title="Subir"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-faint hover:text-foreground"
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
