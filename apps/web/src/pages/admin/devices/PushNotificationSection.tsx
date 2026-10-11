import { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellPlus,
  Search,
  Send,
  Eye,
  History,
  Users,
  X,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminPagination } from '@/components/ui-custom/AdminPagination';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { toast } from 'sonner';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatDateTime } from '@/lib/format';
import type { AdminDevice, AdminDeviceList, PushAudience, PushCampaignInput, PushNotificationLog } from '@radio/types';

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

function PlatformLabel({ platform }: { platform: string }) {
  return <span>{PLATFORM_CONFIG[platform.toLowerCase()]?.label ?? platform}</span>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="shrink-0 pt-0.5 font-mono text-xs text-faint">{label}</span>
      <div className="min-w-0 text-right text-xs text-foreground/90">{value}</div>
    </div>
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
                  {filters.platform && <DetailRow label="Plataforma" value={<PlatformLabel platform={filters.platform} />} />}
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

/**
 * Push campaign composer plus send history. When the audience is a manual
 * device selection, rows are picked from a searchable device picker instead
 * of the registry table.
 */
export default function PushNotificationSection() {
  const { getDevices, getDeviceZones, previewPushCampaign, sendPushCampaign, getPushNotificationLogs } = useAdminApi();

  const [pickerData, setPickerData] = useState<AdminDeviceList | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [selectedDevices, setSelectedDevices] = useState<AdminDevice[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignBody, setCampaignBody] = useState('');
  const [campaignAudience, setCampaignAudience] = useState<PushAudience>('all');
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
  const [selectedLog, setSelectedLog] = useState<PushNotificationLog | null>(null);

  useEffect(() => { let c = false; getDeviceZones().then((r) => { if (!c) setZones(r.zones); }).catch(() => {}); return () => { c = true; }; }, [getDeviceZones]);
  useEffect(() => {
    let c = false;
    getDevices({ page: 1, limit: 100, program: pickerQuery.trim() || undefined })
      .then((r) => { if (!c) setPickerData(r); })
      .catch(() => {});
    return () => { c = true; };
  }, [getDevices, pickerQuery, pickerOpen]);

  const loadLogs = useCallback(async () => {
    try {
      const res = await getPushNotificationLogs({ page: logsPage, limit: 10 }).then((d) => ({ ok: true as const, data: d }), (): { ok: false; data: null } => ({ ok: false, data: null }));
      if (res.ok) { setLogs(res.data.rows); setLogsTotalPages(Math.max(1, res.data.totalPages)); }
    } finally { setLogsLoading(false); }
  }, [getPushNotificationLogs, logsPage]);
  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const toggleDevice = (device: AdminDevice) => setSelectedDevices((prev) => {
    const exists = prev.some((d) => d.deviceId === device.deviceId);
    return exists ? prev.filter((d) => d.deviceId !== device.deviceId) : [...prev, device];
  });
  const removeDevice = (id: string) => setSelectedDevices((prev) => prev.filter((d) => d.deviceId !== id));

  const buildCampaign = (): PushCampaignInput => ({
    title: campaignTitle.trim(), body: campaignBody.trim(), audience: campaignAudience,
    deviceIds: campaignAudience === 'devices' ? selectedDevices.map((d) => d.deviceId) : undefined,
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

  const pickerResults = pickerData?.rows ?? [];

  return (
    <div className="space-y-6">
      {/* Composer */}
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
              <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed">
                <span className="inline-flex items-center gap-1.5 font-medium"><Users className="h-3.5 w-3.5 text-warning" />{selectedDevices.length} dispositivo{selectedDevices.length !== 1 ? 's' : ''} seleccionado{selectedDevices.length !== 1 ? 's' : ''}</span>
                <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="h-7 rounded-full gap-1 border-border bg-card text-xs">Elegir dispositivos</Button>
                {selectedDevices.length > 0 && <Button variant="ghost" size="sm" onClick={() => setSelectedDevices([])} className="ml-auto h-7 rounded-full gap-1 text-xs"><X className="h-3 w-3" />Limpiar</Button>}
              </div>
              {selectedDevices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedDevices.map((d) => (
                    <button key={d.deviceId} onClick={() => removeDevice(d.deviceId)} className="inline-flex max-w-56 items-center gap-1 truncate rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-muted-foreground ring-1 ring-border hover:text-foreground" title={`${d.deviceId} — quitar`}>
                      {d.deviceId.slice(0, 12)}…<X className="h-2.5 w-2.5" />
                    </button>
                  ))}
                </div>
              )}
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
                <SelectContent>{Object.keys(PLATFORM_CONFIG).map((p) => <SelectItem key={p} value={p}><PlatformLabel platform={p} /></SelectItem>)}</SelectContent>
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
            <Button size="sm" onClick={() => setSendConfirmOpen(true)} disabled={sending || !campaignTitle.trim() || !campaignBody.trim() || (campaignAudience === 'devices' && selectedDevices.length === 0)} className="gap-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-transform duration-150"><Send className="h-4 w-4" />{sending ? 'Enviando…' : 'Enviar notificación'}</Button>
            {preview !== null && <span className="rounded-full bg-info/10 px-3 py-1 font-mono text-xs tabular-nums text-info ring-1 ring-info/15">Alcance: {preview} dispositivo{preview !== 1 ? 's' : ''}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Send history */}
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
      <PushLogDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />

      {/* Device picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="border-border bg-card">
          <DialogHeader>
            <DialogTitle>Elegir dispositivos</DialogTitle>
            <DialogDescription>Busca por programa o ID y toca los dispositivos que recibirán el push.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} placeholder="Filtrar por programa…" className="h-9 border-border bg-sunken pl-9 focus-visible:ring-primary/20" />
          </div>
          {!pickerData ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-sunken" />)}</div>
          ) : pickerResults.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">No hay dispositivos con ese filtro.</p>
          ) : (
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              {pickerResults.map((device) => {
                const selected = selectedDevices.some((d) => d.deviceId === device.deviceId);
                return (
                  <button
                    key={device.deviceId}
                    onClick={() => toggleDevice(device)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${selected ? 'border-primary/40 bg-primary/10' : 'border-border bg-sunken hover:bg-accent'}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs text-foreground/90">{device.deviceId}</span>
                      <span className="block truncate text-xs text-muted-foreground">{PLATFORM_CONFIG[device.platform?.toLowerCase() ?? '']?.label ?? device.platform ?? '—'} · {device.subscriptions.length} suscripciones</span>
                    </span>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent'}`}>
                      <Check className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="font-mono text-xs text-faint">{selectedDevices.length} seleccionados</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
