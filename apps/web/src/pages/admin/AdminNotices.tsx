import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Megaphone, Pin, Eye, Trash2, Pencil, RefreshCw, ExternalLink, CalendarRange, Users, Layers, ShieldCheck, Clock3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AdminPagination } from '@/components/ui-custom/AdminPagination';
import { ConfirmDialog } from '@/components/ui-custom/ConfirmDialog';
import { toast } from 'sonner';
import { useAdminApi } from '@/hooks/useAdminApi';
import { formatDateTime } from '@/lib/format';
import { API_BASE_URL } from '@/config';
import type { AppNotice, AppNoticeInput, NoticeAudience, NoticeVariant, NoticeDisplayMode, NoticeImage } from '@radio/types';



// Variant styling — papel manila + sello según tono
const VARIANT_CFG: Record<NoticeVariant, { label: string; dot: string; border: string; badge: string }> = {
  info: { label: 'Informativo', dot: 'bg-info', border: 'border-l-info', badge: 'bg-info/10 text-info border-info/20' },
  event: { label: 'Evento', dot: 'bg-primary', border: 'border-l-primary', badge: 'bg-primary/10 text-primary border-primary/20' },
  warning: { label: 'Urgente', dot: 'bg-warning', border: 'border-l-warning', badge: 'bg-warning/10 text-warning border-warning/20' },
  prayer: { label: 'Oración', dot: 'bg-success', border: 'border-l-success', badge: 'bg-success/10 text-success border-success/20' },
};

const AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  all: 'Todos',
  zone: 'Por zona',
  platform: 'Por plataforma',
  program: 'Por programa',
  devices: 'Dispositivos seleccionados',
};

function statusFor(notice: AppNotice): { label: string; tone: string } {
  const now = Date.now();
  const s = new Date(notice.startsAt).getTime();
  const e = new Date(notice.endsAt).getTime();
  if (!notice.isActive) return { label: 'Pausado', tone: 'bg-muted text-muted-foreground border-border' };
  if (now < s) return { label: 'Programado', tone: 'bg-info/10 text-info border-info/20' };
  if (now > e) return { label: 'Expirado', tone: 'bg-muted text-muted-foreground border-border' };
  return { label: 'Activo', tone: 'bg-success/10 text-success border-success/20' };
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resolveNoticeImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/media/')) return `${API_BASE_URL}/api${url}`;
  return url;
}

function PreviewCard({
  title,
  body,
  imageUrl,
  ctaLabel,
  variant,
  displayMode,
}: {
  title: string;
  body: string;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  variant: NoticeVariant;
  displayMode: NoticeDisplayMode;
}) {
  const cfg = VARIANT_CFG[variant];
  const dotClass = cfg.dot;
  const resolved = resolveNoticeImageSrc(imageUrl ?? null);
  if (displayMode === 'modal') {
    return (
      <div className={`overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_16px_40px_rgba(0,0,0,0.35)] border-t-4 ${cfg.border.replace('border-l-', 'border-t-')}`}>
        <div className="relative flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2.5">
          <span className="flex items-center gap-2">
            <span className="relative grid h-2 w-2 place-items-center" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-tally/40" />
              <span className="relative h-2 w-2 rounded-full bg-tally shadow-[0_0_8px_hsl(var(--tally)/0.5)]" />
            </span>
            <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-card-foreground">EN EL AIRE</span>
            <span className={`hidden h-1.5 w-1.5 rounded-full sm:inline ${dotClass}`} aria-hidden />
          </span>
          <span className="hidden items-center gap-1 font-mono text-[9px] tracking-[0.08em] text-faint sm:flex" aria-hidden>
            <span>88</span><span className="h-2 w-px bg-border" /><span>96</span><span className="h-3 w-px bg-primary" /><span>104</span><span>108 FM</span>
          </span>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-muted-foreground"><span className="text-[11px]">×</span></span>
        </div>
        {resolved && <img src={resolved} alt="" className="aspect-[16/8] w-full object-cover" />}
        <div className="p-4">
          <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[11px] ${cfg.badge}`}>{cfg.label} · centrado al entrar</span>
          <h4 className="mt-2 font-[800] leading-tight tracking-tight text-card-foreground" style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: '20px' }}>
            {title || 'Título del aviso'}
          </h4>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {body || 'El cuerpo del aviso aparecerá aquí. Usa un mensaje breve y cálido.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ctaLabel ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
                {ctaLabel} <ExternalLink className="h-3 w-3" />
              </span>
            ) : (
              <span className="inline-flex rounded-full border border-border bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground">Continuar escuchando</span>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`overflow-hidden rounded-xl border bg-card shadow-sm border-l-4 ${cfg.border}`}>
      <div className={`h-[3px] w-full ${dotClass}`} aria-hidden />
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground">{cfg.label} · discreto</span>
        <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-faint">AVISO</span>
      </div>
      {resolved && <img src={resolved} alt="" className="aspect-[16/7] w-full object-cover" />}
      <div className="p-4">
        <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[11px] ${cfg.badge}`}>{cfg.label}</span>
        <h4 className="mt-2 font-[700] leading-tight text-card-foreground" style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: '18px' }}>
          {title || 'Título del aviso'}
        </h4>
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{body || 'El cuerpo del aviso aparecerá aquí. Usa un mensaje breve y cálido.'}</p>
        {ctaLabel && <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{ctaLabel} <ExternalLink className="h-3 w-3" /></span>}
      </div>
    </div>
  );
}

export default function AdminNotices() {
  const { getNotices, createNotice, updateNotice, deleteNotice, previewNoticeAudience, getDeviceZones, getNoticeImages, uploadNoticeImage, deleteNoticeImage } = useAdminApi();
  const shouldReduceMotion = useReducedMotion();

  const [rows, setRows] = useState<AppNotice[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<string[]>([]);
  const [editing, setEditing] = useState<AppNotice | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppNotice | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [library, setLibrary] = useState<NoticeImage[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  // form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [variant, setVariant] = useState<NoticeVariant>('info');
  const [displayMode, setDisplayMode] = useState<NoticeDisplayMode>('toast');
  const [audience, setAudience] = useState<NoticeAudience>('all');
  const [audienceZoneId, setAudienceZoneId] = useState('');
  const [audiencePlatform, setAudiencePlatform] = useState('');
  const [audienceProgram, setAudienceProgram] = useState('');
  const [audienceDeviceIds, setAudienceDeviceIds] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86400000)));
  const [maxDisplays, setMaxDisplays] = useState('3');
  const [dismissible, setDismissible] = useState(true);
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotices({ page, limit: 12 });
      setRows(res.rows);
      setTotalPages(Math.max(1, res.totalPages));
    } catch {
      toast.error('No se pudo cargar el tablón');
    } finally { setLoading(false); }
  }, [getNotices, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { let c = false; getDeviceZones().then((r) => { if (!c) setZones(r.zones); }).catch(() => {}); return () => { c = true; }; }, [getDeviceZones]);

  const resetForm = () => {
    setEditing(null); setTitle(''); setBody(''); setImageUrl(''); setCtaLabel(''); setCtaUrl('');
    setVariant('info'); setDisplayMode('toast'); setAudience('all'); setAudienceZoneId(''); setAudiencePlatform(''); setAudienceProgram(''); setAudienceDeviceIds('');
    setStartsAt(toLocalInput(new Date())); setEndsAt(toLocalInput(new Date(Date.now() + 7 * 86400000)));
    setMaxDisplays('3'); setDismissible(true); setIsActive(true); setPreviewCount(null); setLocalPreview(null);
  };

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await getNoticeImages({ limit: 24 });
      setLibrary(res.rows);
    } catch { toast.error('No se pudo cargar la biblioteca'); }
    finally { setLibraryLoading(false); }
  }, [getNoticeImages]);

  useEffect(() => { if (libraryOpen) void loadLibrary(); }, [libraryOpen, loadLibrary]);

  const handleImageFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Máx 8 MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Solo imágenes'); return; }
    const previewUrl = URL.createObjectURL(file);
    setLocalPreview(previewUrl);
    setImageUploading(true);
    try {
      const img = await uploadNoticeImage(file);
      setImageUrl(img.url);
      toast.success(`Imagen optimizada ${Math.round(img.size / 1024)} KB · ${img.width ?? '?'}×${img.height ?? '?'}`);
      await loadLibrary();
    } catch { toast.error('No se pudo subir la imagen'); }
    finally { setImageUploading(false); }
  };

  const handleDeleteImage = async (id: string) => {
    try { await deleteNoticeImage(id); toast.success('Imagen eliminada'); void loadLibrary(); if (library.find((x) => x.id === id)?.url === imageUrl) setImageUrl(''); }
    catch { toast.error('No se pudo eliminar'); }
  };

  const openEdit = (n: AppNotice) => {
    setEditing(n);
    setTitle(n.title); setBody(n.body); setImageUrl(n.imageUrl ?? ''); setCtaLabel(n.ctaLabel ?? ''); setCtaUrl(n.ctaUrl ?? '');
    setVariant(n.variant); setDisplayMode((n as unknown as { displayMode?: NoticeDisplayMode }).displayMode ?? 'toast'); setAudience(n.audience);
    setAudienceZoneId(n.audienceZoneId ?? ''); setAudiencePlatform(n.audiencePlatform ?? ''); setAudienceProgram(n.audienceProgram ?? '');
    setAudienceDeviceIds(n.audienceDeviceIds ? JSON.parse(n.audienceDeviceIds).join(', ') : '');
    setStartsAt(toLocalInput(new Date(n.startsAt))); setEndsAt(toLocalInput(new Date(n.endsAt)));
    setMaxDisplays(String(n.maxDisplaysPerUser)); setDismissible(n.dismissible); setIsActive(n.isActive);
    setShowForm(true);
  };

  const handlePreview = async () => {
    try {
      const r = await previewNoticeAudience({
        audience, audienceZoneId: audienceZoneId || null, audiencePlatform: audiencePlatform || null,
        audienceProgram: audienceProgram || null,
        audienceDeviceIds: audienceDeviceIds ? audienceDeviceIds.split(',').map((s) => s.trim()).filter(Boolean) : null,
      } as never);
      setPreviewCount(r.targeted);
      toast.success(`${r.targeted} dispositivo${r.targeted !== 1 ? 's' : ''} alcanzados`);
    } catch { toast.error('No se pudo previsualizar'); }
  };

  const handleSubmit = async () => {
    const payload: AppNoticeInput = {
      title: title.trim(), body: body.trim(),
      imageUrl: imageUrl.trim() || null, ctaLabel: ctaLabel.trim() || null, ctaUrl: ctaUrl.trim() || null,
      variant, audience,
      audienceZoneId: audience === 'zone' ? audienceZoneId.trim() || null : null,
      audiencePlatform: audience === 'platform' ? audiencePlatform || null : null,
      audienceProgram: audience === 'program' ? audienceProgram.trim() || null : null,
      audienceDeviceIds: audience === 'devices' ? audienceDeviceIds.split(',').map((s) => s.trim()).filter(Boolean) : null,
      displayMode,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      maxDisplaysPerUser: Math.max(0, Number(maxDisplays) || 0),
      dismissible, isActive,
    };
    if (!payload.title || !payload.body) { toast.error('Título y cuerpo son obligatorios'); return; }
    try {
      if (editing) await updateNotice(editing.id, payload);
      else await createNotice(payload);
      toast.success(editing ? 'Aviso actualizado' : 'Aviso creado');
      setShowForm(false); resetForm(); void load();
    } catch { toast.error('No se pudo guardar'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteNotice(deleteTarget.id); toast.success('Aviso eliminado'); setDeleteTarget(null); void load(); }
    catch { toast.error('No se pudo eliminar'); }
  };

  return (
    <div className="space-y-6">

      {/* Header tablón */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Cabina · Tablón de avisos</p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Megaphone className="h-4 w-4" /></span>
                Avisos para oyentes
              </h1>
              <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">Un anuncio pequeño, no un pop-up agresivo. Elige ventana, frecuencia y zona. Se muestra en web y app hasta que expire o el oyente lo descarte.</p>
            </div>
            <Button onClick={() => { resetForm(); setShowForm(true); }} className="hidden shrink-0 gap-2 rounded-full sm:inline-flex"><Pin className="h-4 w-4" />Nuevo aviso</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sunken px-3 py-1 font-mono text-xs"><Layers className="h-3 w-3 text-faint" />{rows.length} en esta página</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-medium text-success"><ShieldCheck className="h-3 w-3" />Respeta no molestar</span>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="ml-auto gap-1.5 rounded-full"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Actualizar</Button>
          </div>
        </div>
        {/* cinta adhesiva superior */}
        <div aria-hidden className="absolute left-1/2 top-0 h-6 w-28 -translate-x-1/2 rounded-b-lg bg-primary/15 backdrop-blur border border-primary/10" style={{ clipPath: 'polygon(4% 0, 96% 0, 100% 100%, 0 100%)' }} />
      </div>

      <Button onClick={() => { resetForm(); setShowForm(true); }} className="w-full gap-2 rounded-full sm:hidden"><Pin className="h-4 w-4" />Nuevo aviso</Button>

      {/* Lista */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-sunken/30 py-3">
          <div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-faint" /><CardTitle className="text-sm">Tablón</CardTitle><span className="ml-auto font-mono text-xs text-faint">{loading ? 'Cargando…' : `${rows.length} avisos`}</span></div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-sunken" />)}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-sunken/50 px-6 py-12 text-center">
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">Aún no hay avisos. Crea el primero: un recordatorio de evento, un cambio de horario o una invitación breve.</p>
              <Button onClick={() => { resetForm(); setShowForm(true); }} className="mt-4 rounded-full">Crear aviso</Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence initial={false}>
                  {rows.map((n, idx) => {
                    const st = statusFor(n);
                    const cfg = VARIANT_CFG[n.variant];
                    const displayMode = (n as unknown as { displayMode?: string }).displayMode ?? 'toast';
                    return (
                      <motion.div key={n.id} layout={!shouldReduceMotion} initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(idx * 0.03, 0.12) }} className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm border-l-4 ${cfg.border}`}>
                        <div className="flex items-center gap-2 border-b border-border bg-sunken/40 px-3 py-2">
                          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} aria-hidden />
                          <span className="font-mono text-[10px] uppercase tracking-widest text-faint">{cfg.label}</span>
                          <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${displayMode === 'modal' ? 'border-amber-500/30 bg-amber-500/10 text-amber-700' : 'border-border bg-card text-faint'}`}>
                            {displayMode === 'modal' ? '● Central' : '▬ Discreto'}
                          </span>
                          <Badge variant="outline" className={`ml-auto rounded-full border text-xs ${st.tone}`}>{st.label}</Badge>
                        </div>
                        {n.imageUrl && <img src={resolveNoticeImageSrc(n.imageUrl) ?? ''} alt="" className="aspect-[16/8] w-full object-cover" />}
                        <div className="flex flex-1 flex-col gap-2 p-3">
                          <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{n.title}</h3>
                          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{n.body}</p>
                          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-sunken px-2 py-0.5 font-mono text-[11px] text-faint"><Users className="h-3 w-3" />{AUDIENCE_LABELS[n.audience]}</span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-sunken px-2 py-0.5 font-mono text-[11px] text-faint"><Clock3 className="h-3 w-3" />{n.maxDisplaysPerUser === 0 ? '∞' : `${n.maxDisplaysPerUser}×`} por usuario</span>
                          </div>
                          <p className="font-mono text-[11px] text-faint">{formatDateTime(n.startsAt)} → {formatDateTime(n.endsAt)}</p>
                          <div className="flex gap-1.5 pt-1">
                            <Button variant="outline" size="sm" onClick={() => openEdit(n)} className="h-7 flex-1 gap-1 rounded-full text-xs"><Pencil className="h-3 w-3" />Editar</Button>
                            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(n)} className="h-7 gap-1 rounded-full text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              {totalPages > 1 && <div className="pt-4"><AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} /></div>}
            </>
          )}
        </CardContent>
      </Card>

      {/* Form dialog — papel manila */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{editing ? 'Editar aviso' : 'Nuevo aviso'}</DialogTitle>
            <DialogDescription>Elige si es tarjeta discreta o anuncio central que aparece al entrar. Define ventana y frecuencia.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 md:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-faint">Título · máx 120</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ej: Vigilia este viernes 8PM" className="border-border bg-sunken" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-faint">Cuerpo · máx 2000 — admite saltos de línea</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} placeholder="Mensaje breve, humano. Qué, cuándo, dónde." className="border-border bg-sunken" />
                <p className="text-right font-mono text-xs text-faint">{body.length}/2000</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs text-faint">Variante</Label>
                  <Select value={variant} onValueChange={(v) => setVariant(v as NoticeVariant)}>
                    <SelectTrigger className="border-border bg-sunken"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Informativo</SelectItem>
                      <SelectItem value="event">Evento</SelectItem>
                      <SelectItem value="warning">Urgente</SelectItem>
                      <SelectItem value="prayer">Oración</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs text-faint">CTA etiqueta</Label>
                  <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Ej: Ver detalles" className="border-border bg-sunken" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-faint">Imagen para popup — sube, elige de biblioteca o pega URL</Label>
                <div className="rounded-xl border border-border bg-sunken p-3 space-y-3">
                  {/* preview actual */}
                  {(imageUrl || localPreview) && (
                    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
                      <img src={resolveNoticeImageSrc(imageUrl) ?? localPreview ?? ''} alt="Preview" className="aspect-[16/7] w-full object-cover" />
                      {imageUrl && <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">Optimizada · {imageUrl.startsWith('/media') ? 'servidor' : 'externa'}</span>}
                      <button onClick={() => { setImageUrl(''); setLocalPreview(null); }} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm font-medium transition-colors ${imageUploading ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'}`}>
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={(e) => void handleImageFile(e.target.files?.[0])} disabled={imageUploading} />
                      <RefreshCw className={`h-4 w-4 ${imageUploading ? 'animate-spin' : ''}`} />
                      {imageUploading ? 'Optimizando…' : 'Subir imagen (max 8 MB)'}
                    </label>
                    <Button type="button" variant="outline" className="rounded-lg" onClick={() => setLibraryOpen((v) => !v)}><Layers className="h-4 w-4" />{libraryOpen ? 'Cerrar' : 'Biblioteca'}</Button>
                  </div>
                  <Input value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setLocalPreview(null); }} placeholder="https://... o /media/notices/xxx.webp (se autocompleta al subir)" className="border-border bg-card font-mono text-xs" />
                  <p className="font-mono text-[11px] leading-relaxed text-faint">Al subir se redimensiona a máx 1280×900, se convierte a WebP quality 82 y queda en el servidor para reusar. También puedes pegar un enlace externo.</p>
                  {libraryOpen && (
                    <div className="rounded-lg border border-border bg-card p-2">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-mono text-xs text-faint">Biblioteca · {library.length} imágenes</span>
                        <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={() => void loadLibrary()} disabled={libraryLoading}><RefreshCw className={`h-3 w-3 ${libraryLoading ? 'animate-spin' : ''}`} /> Recargar</Button>
                      </div>
                      {libraryLoading ? <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-sunken" />)}</div>
                      : library.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay imágenes subidas.</p>
                      : <div className="grid max-h-[220px] grid-cols-3 gap-2 overflow-y-auto pr-1">
                        {library.map((img) => (
                          <div key={img.id} className={`group relative overflow-hidden rounded-lg border ${imageUrl === img.url ? 'border-primary ring-1 ring-primary' : 'border-border'} bg-sunken`}>
                            <button type="button" onClick={() => { setImageUrl(img.url); setLocalPreview(null); }} className="block w-full">
                              <img src={`${API_BASE_URL}${img.url}`} alt={img.originalName} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                            </button>
                            <div className="flex items-center justify-between gap-1 bg-card px-1.5 py-1">
                              <span className="truncate font-mono text-[10px] text-faint" title={img.originalName}>{Math.round(img.size / 1024)} KB</span>
                              <button type="button" onClick={() => void handleDeleteImage(img.id)} className="rounded-full p-1 text-faint hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                            </div>
                            {imageUrl === img.url && <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground">Usando</span>}
                          </div>
                        ))}
                      </div>}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs text-faint">CTA URL</Label>
                  <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." className="border-border bg-sunken" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs text-faint">CTA etiqueta</Label>
                  <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Ej: Ver detalles" className="border-border bg-sunken" />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs text-faint">CTA URL</Label>
                  <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." className="border-border bg-sunken" />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-sunken p-3 space-y-2">
                <p className="font-mono text-xs font-medium text-faint">Modo de aparición</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDisplayMode('toast')}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${displayMode === 'toast' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-sunken'}`}
                  >
                    <span className="block text-xs font-semibold">Discreto</span>
                    <span className={`block text-[11px] leading-tight ${displayMode === 'toast' ? 'text-primary-foreground/80' : 'text-faint'}`}>Tarjeta abajo, no interrumpe</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayMode('modal')}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${displayMode === 'modal' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-sunken'}`}
                  >
                    <span className="block text-xs font-semibold">Anuncio central</span>
                    <span className={`block text-[11px] leading-tight ${displayMode === 'modal' ? 'text-primary-foreground/80' : 'text-faint'}`}>Ocupa el centro al entrar, se cierra fácil</span>
                  </button>
                </div>
                {displayMode === 'modal' && (
                  <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-amber-700 ring-1 ring-amber-500/20">Modo intrusivo: aparece una sola vez al entrar (respeta máx. por usuario) y se puede cerrar con ×, clic fuera o Esc. Úsalo solo para avisos que no pueden perderse.</p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-sunken p-3 space-y-3">
                <p className="font-mono text-xs font-medium text-faint">Audiencia — reutiliza zonas del sistema de notificaciones</p>
                <Select value={audience} onValueChange={(v) => setAudience(v as NoticeAudience)}>
                  <SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(AUDIENCE_LABELS) as NoticeAudience[]).map((a) => <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>)}</SelectContent>
                </Select>
                {audience === 'zone' && (
                  <div className="space-y-2">
                    <Input value={audienceZoneId} onChange={(e) => setAudienceZoneId(e.target.value)} list="notice-zones" placeholder="Ej: Cartago" className="border-border bg-card" />
                    <datalist id="notice-zones">{zones.map((z) => <option key={z} value={z} />)}</datalist>
                    {zones.length > 0 && <div className="flex flex-wrap gap-1.5">{zones.map((z) => <button key={z} onClick={() => setAudienceZoneId(z)} className={`rounded-full border px-2.5 py-1 text-xs ${audienceZoneId === z ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}>{z}</button>)}</div>}
                  </div>
                )}
                {audience === 'platform' && (
                  <Select value={audiencePlatform} onValueChange={setAudiencePlatform}>
                    <SelectTrigger className="border-border bg-card"><SelectValue placeholder="Plataforma" /></SelectTrigger>
                    <SelectContent><SelectItem value="android">Android</SelectItem><SelectItem value="ios">iOS</SelectItem><SelectItem value="web">Web</SelectItem></SelectContent>
                  </Select>
                )}
                {audience === 'program' && <Input value={audienceProgram} onChange={(e) => setAudienceProgram(e.target.value)} placeholder="Ej: Amanecer con fe" className="border-border bg-card" />}
                {audience === 'devices' && <Textarea value={audienceDeviceIds} onChange={(e) => setAudienceDeviceIds(e.target.value)} placeholder="deviceId, deviceId..." rows={2} className="border-border bg-card font-mono text-xs" />}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void handlePreview()} className="gap-1 rounded-full"><Eye className="h-3.5 w-3.5" />Previsualizar alcance</Button>
                  {previewCount !== null && <span className="rounded-full bg-info/10 px-2.5 py-1 font-mono text-xs text-info ring-1 ring-info/20">{previewCount} dispositivos</span>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 font-mono text-xs text-faint"><CalendarRange className="h-3 w-3" />Desde</Label>
                  <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="border-border bg-sunken" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 font-mono text-xs text-faint"><CalendarRange className="h-3 w-3" />Hasta</Label>
                  <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="border-border bg-sunken" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-sunken p-3">
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs text-faint">Máx. por usuario (0 = ilimitado)</Label>
                  <Select value={maxDisplays} onValueChange={setMaxDisplays}>
                    <SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 vez</SelectItem>
                      <SelectItem value="2">2 veces</SelectItem>
                      <SelectItem value="3">3 veces (recomendado)</SelectItem>
                      <SelectItem value="5">5 veces</SelectItem>
                      <SelectItem value="0">Ilimitado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono text-xs text-faint">Descartable</span>
                    <Switch checked={dismissible} onCheckedChange={setDismissible} />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono text-xs text-faint">Activo</span>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }} className="flex-1 rounded-full">Cancelar</Button>
                <Button onClick={() => void handleSubmit()} className="flex-1 rounded-full">{editing ? 'Guardar' : 'Publicar aviso'}</Button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-mono text-xs font-medium tracking-wide text-faint">Vista previa — como lo verá el oyente</p>
              <PreviewCard title={title} body={body} imageUrl={imageUrl} ctaLabel={ctaLabel} variant={variant} displayMode={displayMode} />
              <div className="rounded-xl border border-dashed border-border bg-sunken/60 p-3">
                <p className="font-mono text-[11px] leading-relaxed text-faint">
                  {displayMode === 'modal'
                    ? 'Modo central: ocupa el centro con fondo oscuro al entrar. Se cierra con ×, clic fuera o Esc. Respeta el límite por usuario.'
                    : 'Modo discreto: tarjeta anclada abajo, no bloquea la reproducción. Si el oyente lo cierra, no vuelve hasta agotar el límite.'}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)} title="¿Eliminar aviso?" description={`Se eliminará "${deleteTarget?.title ?? ''}".`} confirmLabel="Eliminar" onConfirm={() => void handleDelete()} />
    </div>
  );
}
