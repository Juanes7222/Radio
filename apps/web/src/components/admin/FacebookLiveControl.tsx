import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Video, VideoOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';

/**
 * Facebook Live control: switches off the announcement and removes the
 * embedded video for every connected client.
 */
export default function FacebookLiveControl() {
  const { getLiveStatus, clearLiveStatus } = useAdminApi();
  const [liveActive, setLiveActive] = useState<boolean>(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadLiveStatus = useCallback(async () => {
    try {
      const res = await getLiveStatus();
      setLiveActive(res.active);
      setLiveUrl(res.url);
    } catch {
      // Silent: the polling retries on the next tick.
    } finally {
      setLiveLoading(false);
    }
  }, [getLiveStatus]);

  // First poll on mount, then every 30s; the `.then` chain is the deliberate
  // choice recorded in docs/frontend-context.md.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLiveStatus();
    const id = setInterval(loadLiveStatus, 30000);
    return () => clearInterval(id);
  }, [loadLiveStatus]);

  const handleClear = useCallback(async () => {
    setClearing(true);
    setFeedback(null);
    try {
      const res = await clearLiveStatus();
      if (res.cleared) {
        setLiveActive(false);
        setLiveUrl(null);
        setFeedback('Aviso de live desactivado. El video embebido ya no se muestra.');
      } else {
        setFeedback(res.message ?? 'No hay transmisión activa.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al desactivar el aviso.';
      setFeedback(msg);
    } finally {
      setClearing(false);
    }
  }, [clearLiveStatus]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {liveActive ? <Video className="h-4 w-4 text-tally" /> : <VideoOff className="h-4 w-4 text-muted-foreground" />}
          Facebook Live
          {liveActive ? (
            <Badge variant="destructive" className="bg-tally text-white">EN VIVO</Badge>
          ) : (
            <Badge variant="secondary">Inactivo</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {liveLoading ? (
          <div className="h-10 animate-pulse rounded-md bg-sunken" />
        ) : liveActive ? (
          <>
            <p className="text-sm text-muted-foreground">
              Hay una transmisión activa. El video embebido se está mostrando en la web y app.
            </p>
            {liveUrl && (
              <p className="truncate rounded-md bg-sunken px-3 py-2 font-mono text-xs text-muted-foreground">
                {liveUrl}
              </p>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleClear()}
              disabled={clearing}
              className="gap-2"
            >
              <VideoOff className="h-4 w-4" />
              {clearing ? 'Desactivando...' : 'Desactivar aviso de live'}
            </Button>
            <p className="text-xs text-faint">Quita el video embebido y notifica a todos los clientes conectados.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No hay transmisión en vivo. El video embebido está oculto.</p>
            <Button variant="outline" size="sm" onClick={() => void loadLiveStatus()} disabled={liveLoading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${liveLoading ? 'animate-spin' : ''}`} />
              Verificar estado
            </Button>
          </>
        )}
        {feedback && (
          <p className="rounded-md bg-sunken px-3 py-2 text-xs text-muted-foreground">{feedback}</p>
        )}
      </CardContent>
    </Card>
  );
}
