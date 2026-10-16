import { Eye, ExternalLink, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDuration } from '@/lib/format';
import type { ListenerDetail } from '@radio/types';

const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

interface ConnectedListenersCardProps {
  listeners: ListenerDetail[];
  onSelectListener: (listener: ListenerDetail) => void;
}

/** Live list of listeners currently attached to the stream. */
export default function ConnectedListenersCard({
  listeners,
  onSelectListener,
}: ConnectedListenersCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Oyentes conectados
            <Badge variant="secondary">{listeners.length}</Badge>
          </CardTitle>
          <a
            href={`${AZURACAST_URL}/station/1/reports/listeners`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Ver más <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardHeader>
      <CardContent>
        {listeners.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay oyentes conectados en este momento.
          </p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {listeners.map((listener, index) => (
              <button
                key={index}
                onClick={() => onSelectListener(listener)}
                className="group w-full rounded-lg bg-sunken p-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{listener.ip}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {listener.location?.city
                        ? `${listener.location.city}, ${listener.location.country}`
                        : listener.mount_name}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    {formatDuration(listener.connected_time)}
                    <Eye className="h-3.5 w-3.5 text-faint transition-colors group-hover:text-primary" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
