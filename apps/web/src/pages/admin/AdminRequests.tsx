import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, CheckCircle2, XCircle, RefreshCw, Clock, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useTheme } from '@/hooks';
import type { SongRequest } from '@/types/admin';

const AZURACAST_URL = import.meta.env.VITE_STATION_URL || 'http://localhost';

export default function AdminRequests() {
  const { getPendingRequests, approveRequest } = useAdminApi();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [requests, setRequests] = useState<SongRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPendingRequests();
      const rows = (data as { rows?: SongRequest[] })?.rows ?? [];
      setRequests(rows);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 500) {
        setError('Las solicitudes de canciones no están habilitadas en esta estación o la clave API no tiene permisos suficientes.');
      } else {
        setError('Error al obtener solicitudes. Verifica la conexión con AzuraCast.');
      }
    } finally {
      setLoading(false);
    }
  }, [getPendingRequests]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const handleDeny = async (id: string) => {
    setActionId(id);
    try {
      await approveRequest(id); // DELETE elimina/rechaza la solicitud
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Solicitudes de canciones</h1>
          
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <a
            href={`${AZURACAST_URL}/station/1/reports/requests`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="sm" className="gap-2 text-xs">
              <ExternalLink className="w-3 h-3" />
              Ver en AzuraCast
            </Button>
          </a>
        </div>
      </div>

      <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4 text-primary" />
              Pendientes
              {requests.length > 0 && (
                <Badge variant="destructive" className="text-xs">{requests.length}</Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className={`py-8 text-center space-y-2`}>
              <XCircle className="w-8 h-8 mx-auto text-destructive opacity-60" />
              <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{error}</p>
              <Button variant="outline" size="sm" onClick={load} className="mt-2 gap-2">
                <RefreshCw className="w-3 h-3" />
                Reintentar
              </Button>
            </div>
          ) : loading && requests.length === 0 ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={`h-16 rounded-lg animate-pulse ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}
                />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-green-500 opacity-60" />
              <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                No hay solicitudes pendientes
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {requests.map((req) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      className={`flex items-center gap-4 p-3 rounded-lg ${
                        isDark ? 'bg-slate-900 border border-slate-700' : 'bg-slate-50 border border-slate-200'
                      }`}
                    >
                      {req.song.art && (
                        <img
                          src={req.song.art}
                          alt={req.song.title}
                          className="w-12 h-12 rounded object-cover shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{req.song.title}</p>
                        <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          {req.song.artist}
                        </p>
                        <div className={`flex items-center gap-1 mt-1 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          <Clock className="w-3 h-3" />
                          {new Date(req.timestamp * 1000).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 w-8 h-8"
                          disabled={actionId === req.id}
                          onClick={() => handleDeny(req.id)}
                          title="Rechazar"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
        <CardContent className="pt-5 pb-5">
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            💡 Las solicitudes aprobadas por AzuraCast se reproducen automáticamente según la configuración de la playlist. Para habilitar/deshabilitar solicitudes ve a{' '}
            <a
              href={`${AZURACAST_URL}/station/1/playlists`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Playlists → Incluir en solicitudes
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
