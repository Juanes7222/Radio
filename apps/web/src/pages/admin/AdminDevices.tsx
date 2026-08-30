import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Smartphone,
  RefreshCw,
  BellRing,
  BellPlus,
  Search,
  X,
  Send,
  Eye,
  MapPin,
  History,
  Check,
  Copy,
  CheckCircle2,
  Radio,
  Signal,
  Users,
  Globe,
  AlertTriangle,
  RotateCcw,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminPagination } from '@/components/ui-custom/AdminPagination';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { toast } from 'sonner';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { AdminDevice, AdminDeviceList, NotificationStats, PushAudience, PushCampaignInput, PushNotificationLog, ZoneRecalcStats, ZoneRecalcResult, ZoneRecalcScope } from '@radio/types';

const PLATFORM_CONFIG: Record<string, { label: string; chip: string }> = {
  android: { label: 'Android', chip: 'bg-success/10 text-success border-success/20' },
  ios: { label: 'iOS', chip: 'bg-info/10 text-info border-info/20' },
  web: { label: 'Web', chip: 'bg-muted text-muted-foreground border-border' },
};

const AUDIENCE_LABELS: Record<PushAudience, string> = {
  all: 'Todos los dispositivos',
  devices: 'Dispositivos seleccionados',
  zone: 'Por zona',
  platform: 'Por plataforma',
  program: 'Por programa suscrito',
  active: 'Activos recientemente',
};

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return <span className="font-mono text-xs text-faint">—</span>;
  const cfg = PLATFORM_CONFIG[platform.toLowerCase()] ?? { label: platform, chip: 'bg-muted text-muted-foreground border-border' };
  return (
    <Badge variant="outline" className={`rounded-full border px-2 py-0 text-xs font-medium ${cfg.chip}`}>
      {cfg.label}
    </Badge>
  );
}

function SubscriptionChips({ subscriptions }: { subscriptions: string[] }) {
  if (subscriptions.length === 0) return <span className="font-mono text-xs text-faint">Ninguna</span>;
  const visible = subscriptions.slice(0, 3);
  const extra = subscriptions.length - visible.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((title) => (
        <span key={title} title={title} className="max-w-40 truncate rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/15">
          {title}
        </span>
      ))}
      {extra > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border">+{extra}</span>}
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
        className="inline-flex items-center gap-1.5 rounded-full border border-transparent px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground active:scale-[0.97]"
        title={zoneId ?? 'Asignar zona'}
      >
        <MapPin className="h-3 w-3 text-faint" />
        {zoneId || <span className="text-faint">Asignar</span>}
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
        className="h-7 w-28 border-border bg-sunken text-xs focus-visible:ring-primary/20"
        autoFocus
      />
      <button onClick={() => void save()} disabled={saving} className="grid h-7 w-7 place-items-center rounded-full bg-success/10 text-success hover:bg-success/15 disabled:opacity-50 transition-colors" title="Guardar">
        <Check className="h-3.5 w-3.5" />
      </button>
      <datalist id="device-zones">
        {zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 pt-0.5 font-mono text-xs text-faint">{label}</span>
      <div className="min-w-0 text-right text-xs text-foreground/90">{value}</div>
    </div>
  );
}

function CopyIdButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={handleCopy} className="text-faint hover:text-primary transition-colors" title="Copiar ID">
      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function DeviceDetailDialog({ device, onClose }: { device: AdminDevice | null; onClose: () => void }) {
  return (
    <Dialog open={device !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle>Detalle del dispositivo</DialogTitle>
          <DialogDescription>Información completa del dispositivo registrado.</DialogDescription>
        </DialogHeader>
        {device && (
          <div className="space-y-4">
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-sunken">
              <DetailRow label="ID de dispositivo" value={<span className="flex items-center justify-end gap-1.5 break-all font-mono">{device.deviceId}<CopyIdButton value={device.deviceId} /></span>} />
              <DetailRow label="Plataforma" value={<PlatformBadge platform={device.platform} />} />
              <DetailRow label="Versión de la app" value={device.appVersion ?? '—'} />
              <DetailRow label="Zona asignada" value={device.zoneId ?? 'Sin asignar'} />
              <DetailRow label="Token FCM" value={<Badge variant="outline" className={`rounded-full border text-xs ${device.hasFcmToken ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'}`}>{device.hasFcmToken ? 'Registrado' : 'No registrado'}</Badge>} />
              <DetailRow label="Registrado" value={formatDateTime(device.createdAt)} />
              <DetailRow label="Última actividad" value={formatDateTime(device.lastSeen)} />
            </div>
            <div>
              <p className="mb-1.5 font-mono text-xs font-medium text-faint">Suscripciones a programas</p>
              {device.subscriptions.length === 0 ? <p className="text-sm text-faint">Ninguna</p> : <div className="flex flex-wrap gap-1.5">{device.subscriptions.map((t) => <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary ring-1 ring-primary/15">{t}</span>)}</div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PushLogDetailDialog({ log, onClose }: { log: PushNotificationLog | null; onClose: () => void }) {
  const filters = log?.filters;
  return (
    <Dialog open={log !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle>Detalle del envío</DialogTitle>
          <DialogDescription>Información completa de la notificación enviada.</DialogDescription>
        </DialogHeader>
        {log && (
          <div className="space-y-4">
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-sunken">
              <DetailRow label="Fecha" value={formatDateTime(log.createdAt)} />
              <DetailRow label="Audiencia" value={AUDIENCE_LABELS[log.audience] ?? log.audience} />
              <DetailRow label="Destinatarios" value={String(log.targetedCount)} />
              <DetailRow label="Enviadas" value={<span className="text-success font-medium">{log.sentCount}</span>} />
              <DetailRow label="Fallidas" value={<span className="text-destructive font-medium">{log.failedCount}</span>} />
              {log.invalidTokens > 0 && <DetailRow label="Tokens inválidos" value={<span className="text-destructive">{log.invalidTokens}</span>} />}
              {filters && (
                <>
                  {filters.zoneId && <DetailRow label="Zona" value={filters.zoneId} />}
                  {filters.platform && <DetailRow label="Plataforma" value={filters.platform} />}
                  {filters.program && <DetailRow label="Programa" value={filters.program} />}
                  {filters.activeDays && <DetailRow label="Activos (días)" value={String(filters.activeDays)} />}
                  {filters.deviceIds && <DetailRow label="Dispositivos" value={`${filters.deviceIds.length} seleccionados`} />}
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{log.title}</p>
              <p className="whitespace-pre-wrap rounded-xl border border-border bg-sunken p-3 text-sm leading-relaxed text-muted-foreground">{log.body}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PushHistoryTable({ logs, onSelect }: { logs: PushNotificationLog[]; onSelect: (log: PushNotificationLog) => void }) {
  const shouldReduceMotion = useReducedMotion();
  if (logs.length === 0) return <p className="py-10 text-center text-sm text-faint">Aún no se han enviado notificaciones personalizadas.</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Table>
        <TableHeader className="bg-sunken">
          <TableRow className="border-border hover:bg-sunken">
            <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Fecha</TableHead>
            <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Título</TableHead>
            <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Audiencia</TableHead>
            <TableHead className="text-right font-mono text-[11px] uppercase tracking-widest text-faint">Env.</TableHead>
            <TableHead className="text-right font-mono text-[11px] uppercase tracking-widest text-faint">Fallos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence initial={false}>
            {logs.map((log, idx) => (
              <motion.tr
                key={log.id}
                layout={!shouldReduceMotion}
                initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={shouldReduceMotion ? { duration: 0.12 } : { delay: Math.min(idx * 0.025, 0.12), duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                onClick={() => onSelect(log)}
                className="cursor-pointer border-border transition-colors hover:bg-accent/50 active:bg-accent"
              >
                <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-faint">{formatDateTime(log.createdAt)}</TableCell>
                <TableCell className="max-w-[280px]">
                  <p className="truncate text-sm font-medium leading-tight" title={log.title}>{log.title}</p>
                  <p className="truncate text-xs text-muted-foreground" title={log.body}>{log.body}</p>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{AUDIENCE_LABELS[log.audience] ?? log.audience}</TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-success">{log.sentCount}<span className="text-faint">/{log.targetedCount}</span></TableCell>
                <TableCell className="text-right font-mono text-sm tabular-nums text-destructive">{log.failedCount}</TableCell>
              </motion.tr>
            ))}
          </AnimatePresence>
        </TableBody>
      </Table>
    </div>
  );
}

function ZoneRecalcCard({ onRecalc }: { onRecalc: () => void }) {
  const { getZoneRecalcStats, recalcZones } = useAdminApi();
  const [recalcStats, setRecalcStats] = useState<ZoneRecalcStats | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcResult, setRecalcResult] = useState<ZoneRecalcResult | null>(null);
  const [scope, setScope] = useState<ZoneRecalcScope>('auto');
  const [forceManual, setForceManual] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dryRunLoading, setDryRunLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const s = await getZoneRecalcStats();
      setRecalcStats(s);
    } catch {
      toast.error('No se pudieron cargar las estadísticas de zonas');
    }
  }, [getZoneRecalcStats]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const handlePreview = async () => {
    setDryRunLoading(true);
    setRecalcResult(null);
    try {
      const r = await recalcZones({ scope, forceManual, dryRun: true });
      setRecalcResult(r);
      toast.success(`Vista previa: ${r.updated} de ${r.considered} se actualizarían`);
    } catch {
      toast.error('Error en la vista previa');
    } finally {
      setDryRunLoading(false);
    }
  };

  const handleRecalc = async () => {
    setConfirmOpen(false);
    setRecalcLoading(true);
    setRecalcResult(null);
    try {
      const r = await recalcZones({ scope, forceManual, dryRun: false });
      setRecalcResult(r);
      toast.success(`Zonas recalculadas: ${r.updated} actualizados`);
      void loadStats();
      onRecalc();
    } catch {
      toast.error('Error al recalcular las zonas');
    } finally {
      setRecalcLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-sunken/50 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-info text-primary-foreground">
            <Globe className="h-4 w-4" />
          </span>
          <div>
            <CardTitle className="text-[15px] font-semibold tracking-tight">Recalcular zonas</CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground">Usa la última IP registrada de cada dispositivo para reasignar su zona geográfica. Respeta zonas MANUALES salvo que lo fuerces.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadStats()} className="ml-auto gap-1.5 rounded-full border-border bg-card">
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5 sm:p-6">
        {/* Stats */}
        {recalcStats ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-sunken px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Total</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{recalcStats.total}</p>
            </div>
            <div className="rounded-xl border border-border bg-sunken px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Sin zona</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-warning">{recalcStats.withoutZone}</p>
            </div>
            <div className="rounded-xl border border-border bg-sunken px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Manuales</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-success">{recalcStats.manual}</p>
            </div>
            <div className="rounded-xl border border-border bg-sunken px-3 py-2.5">
              <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Con IP</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums">{recalcStats.withIp}</p>
              <p className="font-mono text-[10px] text-faint">{recalcStats.withoutIp} sin IP</p>
            </div>
          </div>
        ) : (
          <div className="h-20 animate-pulse rounded-xl bg-sunken" />
        )}

        {recalcStats && recalcStats.withoutIp > 0 && (
          <div className="flex gap-2 rounded-xl border border-warning/20 bg-warning/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <span>{recalcStats.withoutIp} dispositivos aún no tienen IP registrada. Se guardará automáticamente en su próxima conexión; mientras tanto no pueden recalcularse.</span>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
          <div className="space-y-1.5">
            <label className="font-mono text-xs font-medium tracking-wide text-faint">Alcance</label>
            <Select value={scope} onValueChange={(v) => setScope(v as ZoneRecalcScope)}>
              <SelectTrigger className="w-44 border-border bg-sunken">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="missing">Solo sin zona</SelectItem>
                <SelectItem value="auto">Auto + sin zona</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" checked={forceManual} onChange={(e) => setForceManual(e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
            <span className="text-muted-foreground">Forzar MANUALES</span>
          </label>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void handlePreview()} disabled={dryRunLoading || recalcLoading} className="gap-1.5 rounded-full border-border bg-card">
              <Eye className="h-4 w-4" />
              {dryRunLoading ? 'Calculando…' : 'Previsualizar'}
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={recalcLoading || dryRunLoading} className="gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
              <RotateCcw className="h-4 w-4" />
              {recalcLoading ? 'Recalculando…' : 'Recalcular'}
            </Button>
          </div>
        </div>

        <p className="flex items-center gap-1.5 font-mono text-[11px] text-faint">
          <Info className="h-3 w-3" />
          Usa resolución GeoIP (MaxMind → ipwho.is → ipapi.co). Los dispositivos MANUAL nunca se tocan salvo que marques “Forzar”.
        </p>

        {/* Result */}
        {recalcResult && (
          <div className="space-y-3 rounded-xl border border-border bg-sunken p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full border-info/20 bg-info/10 text-info">Considerados: {recalcResult.considered}</Badge>
              <Badge variant="outline" className="rounded-full border-success/20 bg-success/10 text-success">Actualizados: {recalcResult.updated}</Badge>
              {recalcResult.skippedManual > 0 && <Badge variant="outline" className="rounded-full border-border bg-card text-muted-foreground">Manuales omitidos: {recalcResult.skippedManual}</Badge>}
              {recalcResult.skippedNoIp > 0 && <Badge variant="outline" className="rounded-full border-warning/20 bg-warning/10 text-warning">Sin IP: {recalcResult.skippedNoIp}</Badge>}
              {recalcResult.failed > 0 && <Badge variant="outline" className="rounded-full border-destructive/20 bg-destructive/10 text-destructive">Fallos: {recalcResult.failed}</Badge>}
              {recalcResult.dryRun && <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/10 text-primary">Vista previa</Badge>}
            </div>
            {recalcResult.changes.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader className="bg-sunken">
                    <TableRow className="border-border">
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Dispositivo</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Antes</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Después</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Fuente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recalcResult.changes.slice(0, 20).map((c) => (
                      <TableRow key={c.deviceId} className="border-border">
                        <TableCell className="max-w-32 truncate font-mono text-xs" title={c.deviceId}>{c.deviceId.slice(0, 8)}…</TableCell>
                        <TableCell className="text-xs">{c.oldZone ?? <span className="text-faint">—</span>}</TableCell>
                        <TableCell className="text-xs font-medium text-success">{c.newZone ?? '—'}</TableCell>
                        <TableCell className="font-mono text-xs text-faint">{c.newSource ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {recalcResult.changes.length > 20 && <p className="px-3 py-2 text-center font-mono text-xs text-faint">…y {recalcResult.changes.length - 20} más</p>}
              </div>
            ) : (
              <p className="py-2 text-center text-sm text-faint">Sin cambios detectados para este alcance.</p>
            )}
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Recalcular zonas?"
        description={
          scope === 'all' && !forceManual
            ? 'Se recalcularán solo zonas automáticas y vacías. Las MANUALES se respetan.'
            : scope === 'all' && forceManual
              ? 'Se recalcularán TODOS los dispositivos, incluso los MANUALES. Esta acción sobrescribe asignaciones manuales.'
              : scope === 'missing'
                ? 'Solo se asignará zona a dispositivos que hoy no tienen ninguna.'
                : 'Se recalcularán las zonas automáticas y se asignará a los que no tienen zona.'
        }
        confirmLabel="Recalcular"
        loading={recalcLoading}
        onConfirm={() => void handleRecalc()}
      />
    </Card>
  );
}

export default function AdminDevices() {
  const { getDevices, getNotificationStats, getDeviceZones, assignDeviceZone, previewPushCampaign, sendPushCampaign, getPushNotificationLogs } = useAdminApi();
  const shouldReduceMotion = useReducedMotion();

  const [data, setData] = useState<AdminDeviceList | null>(null);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [program, setProgram] = useState('');
  const [query, setQuery] = useState('');
  const [zones, setZones] = useState<string[]>([]);
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
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [logs, setLogs] = useState<PushNotificationLog[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsLoading, setLogsLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<AdminDevice | null>(null);
  const [selectedLog, setSelectedLog] = useState<PushNotificationLog | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getDevices({ page, limit: 20, program: program || undefined }).then((res) => ({ ok: true as const, res }), (): { ok: false; res: null } => ({ ok: false, res: null }));
      if (result.ok) { setData(result.res); setError(null); } else setError('Error al obtener los dispositivos.');
    } finally { setLoading(false); }
  }, [getDevices, page, program]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { let c = false; getNotificationStats().then((r) => { if (!c) setStats(r); }).catch(() => {}); return () => { c = true; }; }, [getNotificationStats]);
  useEffect(() => { let c = false; getDeviceZones().then((r) => { if (!c) setZones(r.zones); }).catch(() => {}); return () => { c = true; }; }, [getDeviceZones]);
  const loadLogs = useCallback(async () => {
    try {
      const res = await getPushNotificationLogs({ page: logsPage, limit: 10 }).then((d) => ({ ok: true as const, data: d }), (): { ok: false; data: null } => ({ ok: false, data: null }));
      if (res.ok) { setLogs(res.data.rows); setLogsTotalPages(Math.max(1, res.data.totalPages)); }
    } finally { setLogsLoading(false); }
  }, [getPushNotificationLogs, logsPage]);
  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const handleRefresh = () => { setLoading(true); void load(); };
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setProgram(query.trim()); setPage(1); };
  const clearSearch = () => { setQuery(''); setProgram(''); setPage(1); };
  const totalPages = data?.totalPages ?? 0;

  const handleAssignZone = useCallback(async (deviceId: string, zoneId: string | null) => {
    await assignDeviceZone(deviceId, zoneId);
    setData((prev) => prev ? { ...prev, rows: prev.rows.map((d) => d.deviceId === deviceId ? { ...d, zoneId } : d) } : prev);
    setZones((prev) => (zoneId && !prev.includes(zoneId) ? [...prev, zoneId] : prev));
  }, [assignDeviceZone]);

  const toggleDevice = (id: string) => setSelectedDevices((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllVisible = () => {
    if (!data) return;
    const ids = data.rows.map((d) => d.deviceId);
    setSelectedDevices((prev) => {
      const all = ids.every((id) => prev.has(id));
      const n = new Set(prev);
      for (const id of ids) if (all) n.delete(id); else n.add(id);
      return n;
    });
  };

  const buildCampaign = (): PushCampaignInput => ({
    title: campaignTitle.trim(), body: campaignBody.trim(), audience: campaignAudience,
    deviceIds: campaignAudience === 'devices' ? [...selectedDevices] : undefined,
    zoneId: campaignAudience === 'zone' ? campaignZone.trim() : undefined,
    platform: campaignAudience === 'platform' ? campaignPlatform : undefined,
    program: campaignAudience === 'program' ? campaignProgram.trim() : undefined,
    activeDays: campaignAudience === 'active' ? Number(campaignActiveDays) || 7 : undefined,
  });

  const handlePreview = async () => {
    try { const res = await previewPushCampaign(buildCampaign()); setPreview(res.targeted); toast.success(`${res.targeted} dispositivo${res.targeted !== 1 ? 's' : ''} recibiría la notificación`); }
    catch { toast.error('No se pudo previsualizar. Revisa el formulario.'); }
  };
  const handleSend = async () => {
    setSendConfirmOpen(false); setSending(true);
    try {
      const r = await sendPushCampaign(buildCampaign());
      toast.success(`Enviada a ${r.sent} de ${r.targeted} objetivo${r.targeted !== 1 ? 's' : ''}`);
      if (r.failed > 0) toast.warning(`${r.failed} no entregadas (${r.invalidTokens} tokens inválidos)`);
      setPreview(null); setLogsPage(1); void loadLogs();
    } catch { toast.error('Error al enviar la notificación.'); } finally { setSending(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header — torre de transmisión */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-[50px]" />
        <div aria-hidden className="pointer-events-none absolute -left-20 -bottom-16 h-48 w-48 rounded-full bg-info/10 blur-[40px]" />
        {/* ondas decorativas */}
        <div aria-hidden className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 lg:block">
          <div className="relative h-24 w-24">
            <span className="absolute inset-0 rounded-full border border-primary/10" />
            <span className="absolute inset-3 rounded-full border border-primary/15" />
            <span className="absolute inset-6 rounded-full border border-primary/20" />
            <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground"><Radio className="h-3.5 w-3.5" /></span>
          </div>
        </div>
        <div className="relative flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">Transmisión · Audiencia conectada</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Dispositivos y notificaciones</h1>
            <p className="mt-1.5 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">Cada teléfono es una antena. Elige la audiencia exacta, previsualiza el alcance y deja rastro de cada envío.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sunken px-3 py-1 font-mono text-xs tabular-nums"><Users className="h-3 w-3 text-faint" />{data ? `${data.total} registrados` : '—'}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-info/20 bg-info/10 px-3 py-1 text-xs font-medium text-info"><Signal className="h-3 w-3" />{stats ? `${stats.total7d} notificaciones / 7d` : '—'}</span>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="ml-auto gap-1.5 rounded-full border-border bg-card active:scale-[0.97] transition-transform duration-150"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
          <Card className="overflow-hidden">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-info/10 ring-1 ring-info/15"><BellRing className="h-5 w-5 text-info" /></span>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Notificaciones de programas · 7 días</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{stats ? stats.total7d : '…'}</p>
              </div>
              <span className="ml-auto hidden h-8 items-center gap-0.5 sm:flex" aria-hidden>
                {Array.from({ length: 10 }).map((_, i) => <span key={i} className="w-1 rounded-full bg-info/20" style={{ height: `${8 + ((i * 7) % 14)}px` }} />)}
              </span>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
          <Card className="overflow-hidden">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/15"><Smartphone className="h-5 w-5 text-primary" /></span>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Dispositivos registrados</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{data ? data.total : '…'}</p>
              </div>
              <Badge variant="outline" className="ml-auto hidden rounded-full border-success/20 bg-success/10 font-mono text-xs text-success sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> En vivo</Badge>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recalcular zonas */}
      <ZoneRecalcCard onRecalc={() => { void load(); void loadLogs(); }} />

      {/* Enviar notificación */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-sunken/50 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><BellPlus className="h-4 w-4" /></span>
            <div>
              <CardTitle className="text-[15px] font-semibold tracking-tight">Enviar notificación personalizada</CardTitle>
              <p className="text-xs leading-relaxed text-muted-foreground">El mensaje llegará como push. Elige bien la audiencia — no hay deshacer.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Título · máx 100</label>
              <Input value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} placeholder="Ej: Invitación especial de esta noche" maxLength={100} className="border-border bg-sunken focus-visible:ring-primary/20" />
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Audiencia</label>
              <Select value={campaignAudience} onValueChange={(v) => setCampaignAudience(v as PushAudience)}>
                <SelectTrigger className="w-full border-border bg-sunken"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(AUDIENCE_LABELS) as PushAudience[]).map((a) => <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="font-mono text-xs font-medium tracking-wide text-faint">Mensaje · máx 500</label>
            <Textarea value={campaignBody} onChange={(e) => setCampaignBody(e.target.value)} placeholder="Escribe el mensaje que verán en la notificación…" maxLength={500} rows={3} className="border-border bg-sunken focus-visible:ring-primary/20" />
            <p className="text-right font-mono text-xs text-faint">{campaignBody.length}/500</p>
          </div>

          {campaignAudience === 'devices' && (
            <div className="rounded-xl border border-warning/15 bg-warning/5 px-4 py-3">
              <p className="flex flex-wrap items-center gap-2 text-sm leading-relaxed">
                <span className="inline-flex items-center gap-1.5 font-medium"><Users className="h-3.5 w-3.5 text-warning" />{selectedDevices.size} dispositivo{selectedDevices.size !== 1 ? 's' : ''} seleccionado{selectedDevices.size !== 1 ? 's' : ''}</span>
                <span className="text-muted-foreground">· Marca filas en la tabla de abajo. Usa “Seleccionar página” para marcar los 20 visibles.</span>
                {selectedDevices.size > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedDevices(new Set())} className="ml-auto h-7 rounded-full gap-1 text-xs"><X className="h-3 w-3" />Limpiar</Button>}
              </p>
            </div>
          )}
          {campaignAudience === 'zone' && (
            <div className="space-y-2">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Zona</label>
              <Input value={campaignZone} onChange={(e) => setCampaignZone(e.target.value)} placeholder="Ej: Cartago, Pereira…" list="campaign-zones" className="border-border bg-sunken focus-visible:ring-primary/20" />
              <datalist id="campaign-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
              {zones.length > 0 && <div className="flex flex-wrap gap-1.5">{zones.map((z) => <button key={z} onClick={() => setCampaignZone(z)} className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors active:scale-[0.97] ${campaignZone === z ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent'}`}>{z}</button>)}</div>}
            </div>
          )}
          {campaignAudience === 'platform' && (
            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Plataforma</label>
              <Select value={campaignPlatform} onValueChange={setCampaignPlatform}>
                <SelectTrigger className="w-full border-border bg-sunken"><SelectValue placeholder="Selecciona una plataforma" /></SelectTrigger>
                <SelectContent>{Object.keys(PLATFORM_CONFIG).map((p) => <SelectItem key={p} value={p}>{PLATFORM_CONFIG[p].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {campaignAudience === 'program' && (
            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Programa suscrito</label>
              <Input value={campaignProgram} onChange={(e) => setCampaignProgram(e.target.value)} placeholder="Ej: Amanecer con fe" className="border-border bg-sunken focus-visible:ring-primary/20" />
              <p className="text-xs leading-relaxed text-faint">Solo los dispositivos suscritos a ese programa recibirán el push.</p>
            </div>
          )}
          {campaignAudience === 'active' && (
            <div className="space-y-1.5">
              <label className="font-mono text-xs font-medium tracking-wide text-faint">Activos en los últimos días</label>
              <Input type="number" min={1} max={365} value={campaignActiveDays} onChange={(e) => setCampaignActiveDays(e.target.value)} className="w-40 border-border bg-sunken focus-visible:ring-primary/20" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button variant="outline" size="sm" onClick={() => void handlePreview()} disabled={sending} className="gap-1.5 rounded-full border-border bg-card active:scale-[0.97]"><Eye className="h-4 w-4" />Previsualizar alcance</Button>
            <Button size="sm" onClick={() => setSendConfirmOpen(true)} disabled={sending || !campaignTitle.trim() || !campaignBody.trim()} className="gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-transform duration-150"><Send className="h-4 w-4" />{sending ? 'Enviando…' : 'Enviar notificación'}</Button>
            {preview !== null && <span className="rounded-full bg-info/10 px-3 py-1 font-mono text-xs tabular-nums text-info ring-1 ring-info/15">Alcance: {preview} dispositivo{preview !== 1 ? 's' : ''}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Dispositivos registrados */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-sunken/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <Smartphone className="h-4 w-4 text-faint" />
              <CardTitle className="text-sm font-semibold tracking-tight">Registrados</CardTitle>
              {data && <Badge variant="outline" className="rounded-full border-border bg-card font-mono text-xs tabular-nums">{data.total} total</Badge>}
            </div>
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por programa…" className="h-9 w-64 border-border bg-sunken pl-9 pr-8 focus-visible:ring-primary/20" />
                {query && <button type="button" onClick={clearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-foreground"><X className="h-4 w-4" /></button>}
              </div>
              <Button type="submit" size="sm" className="rounded-full gap-1 active:scale-[0.97]">Buscar</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="py-12 text-center"><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" size="sm" onClick={handleRefresh} className="mt-3 gap-2 rounded-full active:scale-[0.97]"><RefreshCw className="h-3 w-3" />Reintentar</Button></div>
          ) : loading && !data ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" style={{ opacity: 1 - i * 0.15 }} />)}</div>
          ) : !data || data.rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-faint">{program ? 'No hay dispositivos suscritos a ese programa.' : 'No hay dispositivos registrados todavía.'}</p>
          ) : (
            <>
              {campaignAudience === 'devices' && (
                <div className="flex items-center gap-2 border-b border-border bg-warning/5 px-4 py-2.5">
                  <Button variant="outline" size="sm" onClick={toggleAllVisible} className="h-7 gap-1 rounded-full border-border bg-card text-xs active:scale-[0.97]"><Check className="h-3.5 w-3.5" />{data.rows.every((d) => selectedDevices.has(d.deviceId)) ? 'Quitar selección' : 'Seleccionar página'}</Button>
                  <span className="font-mono text-xs text-faint">{selectedDevices.size} seleccionados en esta vista</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-sunken/50">
                    <TableRow className="border-border hover:bg-sunken/50">
                      {campaignAudience === 'devices' && <TableHead className="w-8"><input type="checkbox" className="accent-primary" checked={data.rows.length > 0 && data.rows.every((d) => selectedDevices.has(d.deviceId))} onChange={toggleAllVisible} /></TableHead>}
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Dispositivo</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Plataforma</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">App</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Zona</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Suscripciones</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">FCM</TableHead>
                      <TableHead className="font-mono text-[11px] uppercase tracking-widest text-faint">Visto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {data.rows.map((device, idx) => (
                        <motion.tr
                          key={device.deviceId}
                          layout={!shouldReduceMotion}
                          initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={shouldReduceMotion ? { duration: 0.12 } : { delay: Math.min(idx * 0.02, 0.1), duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                          className={`border-border transition-colors hover:bg-accent/50 ${selectedDevices.has(device.deviceId) ? 'bg-primary/5 hover:bg-primary/10' : ''}`}
                        >
                          {campaignAudience === 'devices' && <TableCell><input type="checkbox" className="accent-primary" checked={selectedDevices.has(device.deviceId)} onChange={() => toggleDevice(device.deviceId)} /></TableCell>}
                          <TableCell><button onClick={() => setSelectedDevice(device)} className="max-w-48 truncate text-left font-mono text-xs text-foreground/90 hover:text-primary hover:underline decoration-primary/30 underline-offset-4" title="Ver detalle">{device.deviceId}</button></TableCell>
                          <TableCell><PlatformBadge platform={device.platform} /></TableCell>
                          <TableCell className="font-mono text-xs tabular-nums text-faint">{device.appVersion ?? '—'}</TableCell>
                          <TableCell><ZoneEditor deviceId={device.deviceId} zoneId={device.zoneId} zones={zones} onAssign={handleAssignZone} /></TableCell>
                          <TableCell><SubscriptionChips subscriptions={device.subscriptions} /></TableCell>
                          <TableCell><Badge variant="outline" className={`rounded-full border px-2 py-0 text-xs ${device.hasFcmToken ? 'bg-success/10 text-success border-success/20' : 'bg-muted text-muted-foreground border-border'}`}>{device.hasFcmToken ? 'Sí' : 'No'}</Badge></TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-faint" title={formatDateTime(device.lastSeen)}>{timeAgo(device.lastSeen)}</TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            </>
          )}
          {data && data.rows.length > 0 && <div className="border-t border-border p-3"><AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} label={`${data.total} dispositivos · Página ${page} de ${Math.max(1, totalPages)}`} /></div>}
        </CardContent>
      </Card>

      {/* Historial */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-sunken/30">
          <div className="flex items-center gap-2.5"><History className="h-4 w-4 text-faint" /><CardTitle className="text-sm font-semibold tracking-tight">Historial de envíos</CardTitle><span className="ml-auto hidden font-mono text-xs text-faint sm:block">Toca una fila para ver detalle</span></div>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-sunken" />)}</div>
            : <div className="p-3 sm:p-4"><PushHistoryTable logs={logs} onSelect={setSelectedLog} />{logsTotalPages > 1 && <div className="pt-3"><AdminPagination page={logsPage} totalPages={logsTotalPages} onPageChange={setLogsPage} label={`Página ${logsPage} de ${logsTotalPages}`} /></div>}</div>}
        </CardContent>
      </Card>

      <ConfirmDialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen} title="¿Enviar esta notificación?" description={preview !== null ? `Llegará a ${preview} dispositivo${preview !== 1 ? 's' : ''}. No se puede deshacer.` : 'Se enviará a la audiencia elegida. No se puede deshacer.'} confirmLabel="Enviar" loading={sending} onConfirm={() => void handleSend()} />
      <DeviceDetailDialog device={selectedDevice} onClose={() => setSelectedDevice(null)} />
      <PushLogDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
