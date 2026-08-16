import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ListMusic, Power, Trash2, RefreshCw, Music2, ExternalLink, Plus, X, Info } from 'lucide-react';
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
import type { AdminPlaylist } from '@radio/types';

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

export default function AdminPlaylists() {
  const { getPlaylists, createPlaylist, togglePlaylist, deletePlaylist } = useAdminApi();

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
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      disabled={actionId === pl.id}
                      onClick={() => handleToggle(pl.id)}
                    >
                      <Power className="w-3 h-3" />
                      {pl.is_enabled ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-slate-400 hover:text-white"
                      disabled={actionId === pl.id}
                      onClick={() => setSelectedPlaylist(pl)}
                      title="Ver detalles"
                    >
                      <Info className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
    </div>
  );
}
