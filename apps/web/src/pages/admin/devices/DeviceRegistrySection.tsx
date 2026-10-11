import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Smartphone,
  RefreshCw,
  Search,
  X,
  Check,
  MapPin,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminPagination } from '@/components/ui-custom/AdminPagination';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { AdminDevice, AdminDeviceList } from '@radio/types';

const PLATFORM_CONFIG: Record<string, { label: string; chip: string }> = {
  android: { label: 'Android', chip: 'bg-success/10 text-success border-success/20' },
  ios: { label: 'iOS', chip: 'bg-info/10 text-info border-info/20' },
  web: { label: 'Web', chip: 'bg-muted text-muted-foreground border-border' },
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
      // Error notification is handled by the caller.
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

/** Device registry: paginated table with zone assignment and detail dialog. */
export default function DeviceRegistrySection() {
  const { getDevices, getDeviceZones, assignDeviceZone } = useAdminApi();
  const shouldReduceMotion = useReducedMotion();

  const [data, setData] = useState<AdminDeviceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [program, setProgram] = useState('');
  const [query, setQuery] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<AdminDevice | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getDevices({ page, limit: 20, program: program || undefined }).then((res) => ({ ok: true as const, res }), (): { ok: false; res: null } => ({ ok: false, res: null }));
      if (result.ok) { setData(result.res); setError(null); } else setError('Error al obtener los dispositivos.');
    } finally { setLoading(false); }
  }, [getDevices, page, program]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { let c = false; getDeviceZones().then((r) => { if (!c) setZones(r.zones); }).catch(() => {}); return () => { c = true; }; }, [getDeviceZones]);

  const handleRefresh = () => { setLoading(true); void load(); };
  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); setProgram(query.trim()); setPage(1); };
  const clearSearch = () => { setQuery(''); setProgram(''); setPage(1); };
  const totalPages = data?.totalPages ?? 0;

  const handleAssignZone = useCallback(async (deviceId: string, zoneId: string | null) => {
    await assignDeviceZone(deviceId, zoneId);
    setData((prev) => prev ? { ...prev, rows: prev.rows.map((d) => d.deviceId === deviceId ? { ...d, zoneId } : d) } : prev);
    setZones((prev) => (zoneId && !prev.includes(zoneId) ? [...prev, zoneId] : prev));
  }, [assignDeviceZone]);

  return (
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-sunken/50">
                <TableRow className="border-border hover:bg-sunken/50">
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
                      transition={shouldReduceMotion ? { duration: 0.12 } : { delay: Math.min(idx * 0.02, 0.1), duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                      className="border-border transition-colors hover:bg-accent/50"
                    >
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
        )}
        {data && data.rows.length > 0 && <div className="border-t border-border p-3"><AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} label={`${data.total} dispositivos · Página ${page} de ${Math.max(1, totalPages)}`} /></div>}
      </CardContent>
      <DeviceDetailDialog device={selectedDevice} onClose={() => setSelectedDevice(null)} />
    </Card>
  );
}
