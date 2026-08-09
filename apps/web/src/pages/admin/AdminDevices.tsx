import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  RefreshCw,
  BellRing,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAdminApi } from '@/hooks/useAdminApi';
import type { AdminDevice, AdminDeviceList, NotificationStats } from '@radio/types';

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  android: { label: 'Android', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  ios: { label: 'iOS', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  web: { label: 'Web', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `hace ${days} día${days > 1 ? 's' : ''}`;
  const hours = Math.floor(diff / 3600000);
  if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
  const minutes = Math.floor(diff / 60000);
  if (minutes > 0) return `hace ${minutes} min`;
  return 'ahora';
}

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return <span className="text-sm text-slate-500">—</span>;
  const config = PLATFORM_CONFIG[platform.toLowerCase()] ?? {
    label: platform,
    color: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return (
    <Badge variant="outline" className={`text-xs border ${config.color}`}>
      {config.label}
    </Badge>
  );
}

function SubscriptionChips({ subscriptions }: { subscriptions: string[] }) {
  if (subscriptions.length === 0) return <span className="text-sm text-slate-500">Ninguna</span>;
  const visible = subscriptions.slice(0, 3);
  const extra = subscriptions.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((title) => (
        <span
          key={title}
          className="px-2 py-0.5 text-xs rounded bg-indigo-500/10 text-indigo-300 max-w-40 truncate"
          title={title}
        >
          {title}
        </span>
      ))}
      {extra > 0 && <span className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300">+{extra}</span>}
    </div>
  );
}

export default function AdminDevices() {
  const { getDevices, getNotificationStats } = useAdminApi();

  const [data, setData] = useState<AdminDeviceList | null>(null);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [program, setProgram] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await getDevices({ page, limit: 20, program: program || undefined }).then(
        (res) => ({ ok: true as const, res }),
        (): { ok: false; res: null } => ({ ok: false, res: null })
      );
      if (result.ok) {
        setData(result.res);
        setError(null);
      } else {
        setError('Error al obtener los dispositivos.');
      }
    } finally {
      setLoading(false);
    }
  }, [getDevices, page, program]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    getNotificationStats()
      .then((res) => {
        if (!cancelled) setStats(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [getNotificationStats]);

  const handleRefresh = () => {
    setLoading(true);
    void load();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setProgram(query.trim());
    setPage(1);
  };

  const clearSearch = () => {
    setQuery('');
    setProgram('');
    setPage(1);
  };

  const totalPages = data?.totalPages ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dispositivos y notificaciones</h1>
          <p className="text-sm text-slate-400 mt-1">
            Dispositivos registrados por la app y sus suscripciones a programas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-slate-700 bg-slate-800/60">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <BellRing className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Notificaciones de programas (7 días)</p>
              <p className="text-xl font-semibold">{stats ? stats.total7d : '…'}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-700 bg-slate-800/60">
          <CardContent className="p-5 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Smartphone className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Dispositivos registrados</p>
              <p className="text-xl font-semibold">{data ? data.total : '…'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-700 bg-slate-800/60">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Registrados</CardTitle>
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrar por programa suscrito..."
                  className="w-64 pl-9 pr-8 bg-slate-900 border-slate-600"
                />
                {query && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button type="submit" size="sm" className="gap-1">
                Buscar
              </Button>
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-sm text-slate-400">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
                <RefreshCw className="w-3 h-3" />
                Reintentar
              </Button>
            </div>
          ) : loading && !data ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded-lg animate-pulse bg-slate-700" />
              ))}
            </div>
          ) : !data || data.rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {program ? 'No hay dispositivos suscritos a ese programa.' : 'No hay dispositivos registrados todavía.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Dispositivo</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Plataforma</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">App</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Suscripciones</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">FCM</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Última actividad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {data.rows.map((device: AdminDevice) => (
                    <tr key={device.deviceId}>
                      <td className="px-4 py-3 text-sm text-slate-300 max-w-48 truncate" title={device.deviceId}>
                        {device.deviceId}
                      </td>
                      <td className="px-4 py-3"><PlatformBadge platform={device.platform} /></td>
                      <td className="px-4 py-3 text-sm text-slate-400">{device.appVersion ?? '—'}</td>
                      <td className="px-4 py-3"><SubscriptionChips subscriptions={device.subscriptions} /></td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs border ${device.hasFcmToken ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                          {device.hasFcmToken ? 'Sí' : 'No'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{timeAgo(device.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && data.rows.length > 0 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs text-slate-400">
                {data.total} dispositivos · Página {data.page} de {Math.max(1, totalPages)}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} className="gap-1">
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="gap-1">
                  Siguiente
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
