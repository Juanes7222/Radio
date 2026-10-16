import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { formatDuration } from '@/lib/format';
import type { AdminPlaylist } from '@radio/types';
import { PLAYLIST_ORDERS, PLAYLIST_TYPES } from './playlistLabels';

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="text-xs shrink-0 text-faint pt-0.5">{label}</span>
      <div className="text-xs text-right text-foreground min-w-0">{value}</div>
    </div>
  );
}

/** Read-only summary of a playlist's full AzuraCast configuration. */
export default function PlaylistDetailDialog({
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
          <div className="rounded-lg border border-border bg-card divide-y divide-border/60">
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
