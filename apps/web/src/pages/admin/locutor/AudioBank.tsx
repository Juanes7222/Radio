import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Square, Trash2, FileAudio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { apiUrl } from '@/config';
import axios from 'axios';
import { toast } from 'sonner';
import type { LocutorAudio } from '@radio/types';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ready: { label: 'Listo', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  pending: { label: 'Pendiente', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  error: { label: 'Error', color: 'bg-red-500/10 text-red-500 border-red-500/20' },
  expired: { label: 'Expirado', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AudioBank() {
  const { getLocutorAudios, deleteLocutorAudio } = useAdminApi();
  const { token } = useAdminAuth();
  const [audios, setAudios] = useState<LocutorAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LocutorAudio | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);

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

  const handleDelete = async (id: string) => {
    setPendingDelete(null);
    setDeletingId(id);
    try {
      await deleteLocutorAudio(id);
      setAudios((prev) => prev.filter((audio) => audio.id !== id));
      toast.success('Audio eliminado');
    } catch {
      setError('Error al eliminar el audio.');
    } finally {
      setDeletingId(null);
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
    <Card className="border-slate-700 bg-slate-800/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Banco de Audios</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => void loadAudios()} disabled={loading} className="gap-2 text-slate-400">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Archivo</TableHead>
              <TableHead>Texto generado</TableHead>
              <TableHead>Voz</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <div className="h-6 rounded animate-pulse bg-slate-700" />
                  </TableCell>
                </TableRow>
              ))
            ) : audios.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <FileAudio className="w-8 h-8 mx-auto mb-2 text-slate-500 opacity-50" />
                  <p className="text-sm text-slate-400">No hay audios generados</p>
                </TableCell>
              </TableRow>
            ) : (
              audios.map((audio) => {
                const status = STATUS_CONFIG[audio.status] ?? { label: audio.status, color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
                return (
                  <TableRow key={audio.id}>
                    <TableCell className="text-slate-300 max-w-48">
                      <p className="truncate" title={audio.filename}>{audio.filename}</p>
                      <p className="text-xs text-slate-500">{timeAgo(audio.generatedAt)}</p>
                    </TableCell>
                    <TableCell className="text-slate-400 max-w-xs truncate" title={audio.textRendered}>
                      {audio.textRendered || '—'}
                    </TableCell>
                    <TableCell className="text-slate-400">{audio.voice}</TableCell>
                    <TableCell className="text-slate-400">
                      <span className="whitespace-nowrap">{formatClock((audio.durationMs ?? 0) / 1000)}</span>
                      <span className="text-xs text-slate-500"> · {formatBytes(audio.fileSizeBytes)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs border ${status.color}`}>
                        {status.label}
                      </Badge>
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
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="¿Eliminar este audio?"
        description="El archivo generado se eliminará del banco de audios. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={deletingId !== null}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete.id)}
      />
    </Card>
  );
}
