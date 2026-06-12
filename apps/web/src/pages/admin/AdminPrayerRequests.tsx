import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, CheckCircle2, RefreshCw, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminApi } from '@/hooks/useAdminApi';
import { useTheme } from '@/hooks';
import type { PrayerRequest } from '@radio/types';

export default function AdminPrayerRequests() {
  const { getPrayerRequests } = useAdminApi();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPrayerRequests();
      const rows = (data as { rows?: PrayerRequest[] })?.rows ?? [];
      setRequests(rows);
    } catch {
      setError('Error al obtener peticiones de oración.');
    } finally {
      setLoading(false);
    }
  }, [getPrayerRequests]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Peticiones de oración</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <Card className={isDark ? 'border-slate-700 bg-slate-800/60' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Heart className="w-4 h-4 text-rose-500" />
              Recibidas
              {requests.length > 0 && (
                <Badge variant="destructive" className="text-xs">{requests.length}</Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="py-8 text-center space-y-2">
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
                No hay peticiones de oración recibidas
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
                      className={`p-4 rounded-lg ${
                        isDark ? 'bg-slate-900 border border-slate-700' : 'bg-slate-50 border border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{req.name}</p>
                          <p className={`text-sm mt-1 whitespace-pre-wrap ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            {req.request}
                          </p>
                          <div className={`flex items-center gap-1 mt-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            <Clock className="w-3 h-3" />
                            {new Date(req.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
