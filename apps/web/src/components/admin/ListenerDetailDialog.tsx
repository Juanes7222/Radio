import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTimeFull, formatDuration } from '@/lib/format';
import type { ListenerDetail } from '@radio/types';

function DetailRow({ label, value, monospace = false }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={`break-all text-right text-xs ${monospace ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

/** Read-only detail of one connected stream listener. */
export default function ListenerDetailDialog({
  listener,
  onClose,
}: {
  listener: ListenerDetail | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={listener !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Oyente conectado</DialogTitle>
          <DialogDescription>Detalles de la conexión al stream.</DialogDescription>
        </DialogHeader>
        {listener && (
          <div className="space-y-3 text-sm">
            <div className="divide-y divide-border rounded-lg border border-border bg-sunken">
              <DetailRow label="Dirección IP" value={listener.ip} monospace />
              <DetailRow
                label="Ubicación"
                value={listener.location?.city
                  ? `${listener.location.city}, ${listener.location.country}`
                  : listener.mount_name}
              />
              {listener.location?.lat !== null && listener.location?.lon !== null && (
                <DetailRow
                  label="Coordenadas"
                  value={`${listener.location?.lat}, ${listener.location?.lon}`}
                  monospace
                />
              )}
              <DetailRow label="Mount point" value={listener.mount_name} monospace />
              <DetailRow
                label="Conectado hace"
                value={`${formatDuration(listener.connected_time)} · ${formatDateTimeFull(listener.connected_on * 1000)}`}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">User agent</p>
              <p className="break-words rounded-lg border border-border bg-sunken p-3 text-xs text-foreground/90">
                {listener.user_agent || '—'}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
