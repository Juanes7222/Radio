import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone,
  RefreshCw,
  BellRing,
  BellPlus,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Send,
  Eye,
  MapPin,
  History,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAdminApi } from '@/hooks/useAdminApi';
import type {
  AdminDevice,
  AdminDeviceList,
  NotificationStats,
  PushAudience,
  PushCampaignInput,
  PushNotificationLog,
} from '@radio/types';

const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  android: { label: 'Android', color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  ios: { label: 'iOS', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  web: { label: 'Web', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

const AUDIENCE_LABELS: Record<PushAudience, string> = {
  all: 'Todos los dispositivos',
  devices: 'Dispositivos seleccionados',
  zone: 'Por zona',
  platform: 'Por plataforma',
  program: 'Por programa suscrito',
  active: 'Activos recientemente',
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

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function ZoneEditor({
  deviceId,
  zoneId,
  zones,
  onAssign,
}: {
  deviceId: string;
  zoneId: string | null;
  zones: string[];
  onAssign: (deviceId: string, zoneId: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(zoneId ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = value.trim();
    setSaving(true);
    try {
      await onAssign(deviceId, next || null);
      setEditing(false);
    } catch {
      toast.error('No se pudo asignar la zona');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(zoneId ?? '');
          setEditing(true);
        }}
        className="flex items-center gap-1 text-sm text-slate-300 hover:text-white"
        title={zoneId ?? 'Asignar zona'}
      >
        <MapPin className="w-3.5 h-3.5 text-slate-500" />
        {zoneId || <span className="text-slate-500">Asignar</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') setEditing(false);
        }}
        list="device-zones"
        placeholder="Zona"
        className="h-7 w-28 bg-slate-900 border-slate-600 text-xs"
        autoFocus
      />
      <button
        onClick={() => void save()}
        disabled={saving}
        className="p-1 text-green-400 hover:text-green-300 disabled:opacity-50"
        title="Guardar"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <datalist id="device-zones">
        {zones.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
    </div>
  );
}

function PushHistoryTable({ logs }: { logs: PushNotificationLog[] }) {
  if (logs.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Aún no se han enviado notificaciones personalizadas.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-700">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Fecha</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Título</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Audiencia</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Destinatarios</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Enviadas</th>
            <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Fallidas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700">
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="px-4 py-3 text-sm text-slate-400 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
              <td className="px-4 py-3">
                <p className="text-sm text-slate-300 font-medium max-w-52 truncate" title={log.title}>{log.title}</p>
                <p className="text-xs text-slate-500 max-w-52 truncate" title={log.body}>{log.body}</p>
              </td>
              <td className="px-4 py-3 text-sm text-slate-400">{AUDIENCE_LABELS[log.audience] ?? log.audience}</td>
              <td className="px-4 py-3 text-sm text-slate-300">{log.targetedCount}</td>
              <td className="px-4 py-3 text-sm text-green-400">{log.sentCount}</td>
              <td className="px-4 py-3 text-sm text-red-400">{log.failedCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDevices() {
  const {
    getDevices,
    getNotificationStats,
    getDeviceZones,
    assignDeviceZone,
    previewPushCampaign,
    sendPushCampaign,
    getPushNotificationLogs,
  } = useAdminApi();

  const [data, setData] = useState<AdminDeviceList | null>(null);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [program, setProgram] = useState('');
  const [query, setQuery] = useState('');

  // Zonas conocidas (para asignación y filtro de envío)
  const [zones, setZones] = useState<string[]>([]);

  // Formulario de envío
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignBody, setCampaignBody] = useState('');
  const [campaignAudience, setCampaignAudience] = useState<PushAudience>('all');
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [campaignZone, setCampaignZone] = useState('');
  const [campaignPlatform, setCampaignPlatform] = useState('');
  const [campaignProgram, setCampaignProgram] = useState('');
  const [campaignActiveDays, setCampaignActiveDays] = useState('7');
  const [preview, setPreview] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  // Historial
  const [logs, setLogs] = useState<PushNotificationLog[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsLoading, setLogsLoading] = useState(true);

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

  useEffect(() => {
    let cancelled = false;
    getDeviceZones()
      .then((res) => {
        if (!cancelled) setZones(res.zones);
      })
      .catch(() => {
        // Las zonas se cargan de forma silenciosa; el formulario sigue usable.
      });
    return () => {
      cancelled = true;
    };
  }, [getDeviceZones]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await getPushNotificationLogs({ page: logsPage, limit: 10 }).then(
        (data) => ({ ok: true as const, data }),
        (): { ok: false; data: null } => ({ ok: false, data: null })
      );
      if (res.ok) {
        setLogs(res.data.rows);
        setLogsTotalPages(Math.max(1, res.data.totalPages));
      }
    } finally {
      setLogsLoading(false);
    }
  }, [getPushNotificationLogs, logsPage]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

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

  const handleAssignZone = useCallback(
    async (deviceId: string, zoneId: string | null) => {
      await assignDeviceZone(deviceId, zoneId);
      // Refresca la fila localmente sin recargar toda la página.
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((device) =>
                device.deviceId === deviceId ? { ...device, zoneId } : device
              ),
            }
          : prev
      );
      setZones((prev) => (zoneId && !prev.includes(zoneId) ? [...prev, zoneId] : prev));
    },
    [assignDeviceZone]
  );

  const toggleDevice = (deviceId: string) => {
    setSelectedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(deviceId)) {
        next.delete(deviceId);
      } else {
        next.add(deviceId);
      }
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (!data) return;
    const visibleIds = data.rows.map((device) => device.deviceId);
    setSelectedDevices((prev) => {
      const allSelected = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  };

  const buildCampaign = (): PushCampaignInput => ({
    title: campaignTitle.trim(),
    body: campaignBody.trim(),
    audience: campaignAudience,
    deviceIds: campaignAudience === 'devices' ? [...selectedDevices] : undefined,
    zoneId: campaignAudience === 'zone' ? campaignZone.trim() : undefined,
    platform: campaignAudience === 'platform' ? campaignPlatform : undefined,
    program: campaignAudience === 'program' ? campaignProgram.trim() : undefined,
    activeDays: campaignAudience === 'active' ? Number(campaignActiveDays) || 7 : undefined,
  });

  const handlePreview = async () => {
    try {
      const res = await previewPushCampaign(buildCampaign());
      setPreview(res.targeted);
      toast.success(`${res.targeted} dispositivo${res.targeted !== 1 ? 's' : ''} recibiría la notificación`);
    } catch {
      toast.error('No se pudo previsualizar la notificación. Revisa el formulario.');
    }
  };

  const handleSend = async () => {
    const confirmed = window.confirm(
      `¿Enviar esta notificación a ${preview !== null ? preview : 'los'} dispositivos seleccionados?`
    );
    if (!confirmed) return;

    setSending(true);
    try {
      const result = await sendPushCampaign(buildCampaign());
      toast.success(
        `Enviada a ${result.sent} dispositivo${result.sent !== 1 ? 's' : ''} de ${result.targeted} objetivo${result.targeted !== 1 ? 's' : ''}`
      );
      if (result.failed > 0) {
        toast.warning(`${result.failed} no se pudieron entregar (${result.invalidTokens} tokens inválidos)`);
      }
      setPreview(null);
      setLogsPage(1);
      void loadLogs();
    } catch {
      toast.error('Error al enviar la notificación.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dispositivos y notificaciones</h1>
          <p className="text-sm text-slate-400 mt-1">
            Dispositivos registrados por la app, sus suscripciones y envío de notificaciones personalizadas.
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

      {/* ── Enviar notificación personalizada ─────────────────────── */}
      <Card className="border-slate-700 bg-slate-800/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BellPlus className="w-5 h-5 text-indigo-400" />
            <CardTitle className="text-base">Enviar notificación personalizada</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Título</label>
              <Input
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="Ej: Mensaje especial de la emisora"
                maxLength={100}
                className="bg-slate-900 border-slate-600"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Audiencia</label>
              <Select value={campaignAudience} onValueChange={(v) => setCampaignAudience(v as PushAudience)}>
                <SelectTrigger className="w-full bg-slate-900 border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(AUDIENCE_LABELS) as PushAudience[]).map((audience) => (
                    <SelectItem key={audience} value={audience}>
                      {AUDIENCE_LABELS[audience]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400">Mensaje</label>
            <Textarea
              value={campaignBody}
              onChange={(e) => setCampaignBody(e.target.value)}
              placeholder="Escribe el mensaje que verán los usuarios..."
              maxLength={500}
              rows={3}
              className="bg-slate-900 border-slate-600"
            />
          </div>

          {/* Filtros según audiencia */}
          {campaignAudience === 'devices' && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p>
                  <span className="font-medium text-slate-200">{selectedDevices.size}</span> dispositivo
                  {selectedDevices.size !== 1 ? 's' : ''} seleccionado
                  {selectedDevices.size !== 1 ? 's' : ''}. Marca los dispositivos en la tabla de abajo.
                </p>
                {selectedDevices.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDevices(new Set())} className="text-slate-400">
                    <X className="w-3.5 h-3.5" />
                    Limpiar
                  </Button>
                )}
              </div>
            </div>
          )}

          {campaignAudience === 'zone' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Zona</label>
              <Input
                value={campaignZone}
                onChange={(e) => setCampaignZone(e.target.value)}
                placeholder="Ej: Cartago, Pereira, Zona Norte..."
                list="campaign-zones"
                className="bg-slate-900 border-slate-600"
              />
              <datalist id="campaign-zones">
                {zones.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              {zones.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {zones.map((zone) => (
                    <button
                      key={zone}
                      onClick={() => setCampaignZone(zone)}
                      className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
                    >
                      {zone}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {campaignAudience === 'platform' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Plataforma</label>
              <Select value={campaignPlatform} onValueChange={setCampaignPlatform}>
                <SelectTrigger className="w-full bg-slate-900 border-slate-600">
                  <SelectValue placeholder="Selecciona una plataforma" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(PLATFORM_CONFIG).map((platform) => (
                    <SelectItem key={platform} value={platform}>
                      {PLATFORM_CONFIG[platform].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {campaignAudience === 'program' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Programa suscrito</label>
              <Input
                value={campaignProgram}
                onChange={(e) => setCampaignProgram(e.target.value)}
                placeholder="Ej: Programa de la mañana"
                className="bg-slate-900 border-slate-600"
              />
              <p className="text-xs text-slate-500">Se notificará a los dispositivos suscritos a ese programa.</p>
            </div>
          )}

          {campaignAudience === 'active' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Activos en los últimos días</label>
              <Input
                type="number"
                min={1}
                max={365}
                value={campaignActiveDays}
                onChange={(e) => setCampaignActiveDays(e.target.value)}
                className="w-40 bg-slate-900 border-slate-600"
              />
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={() => void handlePreview()} className="gap-2" disabled={sending}>
              <Eye className="w-4 h-4" />
              Previsualizar
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSend()}
              className="gap-2 bg-indigo-600 hover:bg-indigo-500"
              disabled={sending || !campaignTitle.trim() || !campaignBody.trim()}
            >
              <Send className="w-4 h-4" />
              {sending ? 'Enviando...' : 'Enviar notificación'}
            </Button>
            {preview !== null && (
              <span className="text-sm text-slate-400">
                Llegará a <span className="font-semibold text-slate-200">{preview}</span> dispositivo
                {preview !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Dispositivos registrados ──────────────────────────────── */}
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
            <>
              {campaignAudience === 'devices' && (
                <div className="mb-3 flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={toggleAllVisible} className="gap-1 text-xs">
                    <Check className="w-3.5 h-3.5" />
                    {data.rows.every((device) => selectedDevices.has(device.deviceId))
                      ? 'Quitar selección de la página'
                      : 'Seleccionar página'}
                  </Button>
                  <span className="text-xs text-slate-500">{data.total} dispositivos en total</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-700">
                  <thead>
                    <tr>
                      {campaignAudience === 'devices' && (
                        <th className="px-4 py-2 w-8 text-left text-xs font-medium text-slate-400 uppercase">
                          <input
                            type="checkbox"
                            className="accent-indigo-500"
                            checked={
                              data.rows.length > 0 &&
                              data.rows.every((device) => selectedDevices.has(device.deviceId))
                            }
                            onChange={toggleAllVisible}
                          />
                        </th>
                      )}
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Dispositivo</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Plataforma</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">App</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Zona</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Suscripciones</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">FCM</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Última actividad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {data.rows.map((device: AdminDevice) => (
                      <tr key={device.deviceId} className={selectedDevices.has(device.deviceId) ? 'bg-indigo-500/5' : ''}>
                        {campaignAudience === 'devices' && (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              className="accent-indigo-500"
                              checked={selectedDevices.has(device.deviceId)}
                              onChange={() => toggleDevice(device.deviceId)}
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm text-slate-300 max-w-48 truncate" title={device.deviceId}>
                          {device.deviceId}
                        </td>
                        <td className="px-4 py-3"><PlatformBadge platform={device.platform} /></td>
                        <td className="px-4 py-3 text-sm text-slate-400">{device.appVersion ?? '—'}</td>
                        <td className="px-4 py-3">
                          <ZoneEditor
                            deviceId={device.deviceId}
                            zoneId={device.zoneId}
                            zones={zones}
                            onAssign={handleAssignZone}
                          />
                        </td>
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
            </>
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

      {/* ── Historial de envíos ───────────────────────────────────── */}
      <Card className="border-slate-700 bg-slate-800/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-400" />
            <CardTitle className="text-base">Historial de notificaciones enviadas</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg animate-pulse bg-slate-700" />
              ))}
            </div>
          ) : (
            <>
              <PushHistoryTable logs={logs} />
              {logsTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-700">
                  <p className="text-xs text-slate-400">Página {logsPage} de {logsTotalPages}</p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setLogsPage((p) => p - 1)} disabled={logsPage <= 1} className="gap-1">
                      <ChevronLeft className="w-4 h-4" />
                      Anterior
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setLogsPage((p) => p + 1)} disabled={logsPage >= logsTotalPages} className="gap-1">
                      Siguiente
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
