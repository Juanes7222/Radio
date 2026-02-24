import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ListMusic, Power, Trash2, RefreshCw, Music2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useTheme } from '@/hooks';
import type { AdminPlaylist } from '@/types/admin';

export default function AdminPlaylists() {
  const { getPlaylists, togglePlaylist, deletePlaylist } = useAdminApi();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPlaylists();
      setPlaylists(data as AdminPlaylist[]);
    } finally {
      setLoading(false);
    }
  }, [getPlaylists]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id: number) => {
    setActionId(id);
    try {
      await togglePlaylist(id);
      await load();
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar la playlist "${name}"? Esta acción no se puede deshacer.`)) return;
    setActionId(id);
    try {
      await deletePlaylist(id);
      await load();
    } finally {
      setActionId(null);
    }
  };

  const playlistTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      default: 'Estándar',
      scheduled: 'Programada',
      once: 'Una vez',
      'on_request': 'Por solicitud',
    };
    return types[type] ?? type;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Playlists</h1>
          <p className={`text-sm mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {playlists.length} playlist{playlists.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <a
            href="http://localhost/station/1/playlists"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Gestionar en AzuraCast
            </Button>
          </a>
        </div>
      </div>

      {loading && playlists.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className={`animate-pulse ${isDark ? 'border-slate-700 bg-slate-800/60' : ''}`}>
              <CardContent className="pt-6 space-y-3">
                <div className={`h-4 rounded ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
                <div className={`h-3 w-2/3 rounded ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : playlists.length === 0 ? (
        <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
          <CardContent className="pt-10 pb-10 text-center space-y-3">
            <ListMusic className="w-10 h-10 mx-auto text-slate-400" />
            <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
              No hay playlists configuradas.
            </p>
            <a href="http://localhost/station/1/playlists" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="w-4 h-4" />
                Crear en AzuraCast
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
                } ${isDark ? 'border-slate-700 bg-slate-800/60' : ''}`}
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
                  <div
                    className={`flex flex-wrap gap-2 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    <span>{playlistTypeLabel(pl.type)}</span>
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
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={actionId === pl.id}
                      onClick={() => handleDelete(pl.id, pl.name)}
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
    </div>
  );
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
