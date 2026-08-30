import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Megaphone, Pin, Eye, Trash2, Pencil, RefreshCw, Users, Layers, ShieldCheck, Clock3, Film } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AdminPagination } from "@/components/ui-custom/AdminPagination";
import { ConfirmDialog } from "@/components/ui-custom/ConfirmDialog";
import { toast } from "sonner";
import { useAdminApi } from "@/hooks/useAdminApi";
import { formatDateTime } from "@/lib/format";
import { resolveNoticeMediaSrc } from "@/lib/noticeMedia";
import { NoticePreviewCard } from "@/components/admin/notices/NoticePreviewCard";
import { NoticeMediaField } from "@/components/admin/notices/NoticeMediaField";
import { NoticeGalleryEditor } from "@/components/admin/notices/NoticeGalleryEditor";
import type { AppNotice, AppNoticeInput, NoticeAudience, NoticeVariant, NoticeDisplayMode, NoticeImage, NoticeVideo, NoticeGalleryItemInput } from "@radio/types";

// Variant styling for notice cards
const VARIANT_CFG: Record<NoticeVariant, { label: string; dot: string; border: string; badge: string }> = {
  info: { label: "Informativo", dot: "bg-info", border: "border-l-info", badge: "bg-info/10 text-info border-info/20" },
  event: { label: "Evento", dot: "bg-primary", border: "border-l-primary", badge: "bg-primary/10 text-primary border-primary/20" },
  warning: { label: "Urgente", dot: "bg-warning", border: "border-l-warning", badge: "bg-warning/10 text-warning border-warning/20" },
  prayer: { label: "Oración", dot: "bg-success", border: "border-l-success", badge: "bg-success/10 text-success border-success/20" },
};

const AUDIENCE_LABELS: Record<NoticeAudience, string> = {
  all: "Todos",
  zone: "Por zona",
  platform: "Por plataforma",
  program: "Por programa",
  devices: "Dispositivos seleccionados",
};

function getNoticeStatus(notice: AppNotice): { label: string; tone: string } {
  const now = Date.now();
  const start = new Date(notice.startsAt).getTime();
  const end = new Date(notice.endsAt).getTime();
  if (!notice.isActive) return { label: "Pausado", tone: "bg-muted text-muted-foreground border-border" };
  if (now < start) return { label: "Programado", tone: "bg-info/10 text-info border-info/20" };
  if (now > end) return { label: "Expirado", tone: "bg-muted text-muted-foreground border-border" };
  return { label: "Activo", tone: "bg-success/10 text-success border-success/20" };
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminNotices() {
  const {
    getNotices,
    createNotice,
    updateNotice,
    deleteNotice,
    previewNoticeAudience,
    getDeviceZones,
    getNoticeImages,
    uploadNoticeImage,
    deleteNoticeImage,
    getNoticeVideos,
    uploadNoticeVideo,
    deleteNoticeVideo,
  } = useAdminApi();
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

  // Image library state
  const [imageLibrary, setImageLibrary] = useState<NoticeImage[]>([]);
  const [imageLibraryLoading, setImageLibraryLoading] = useState(false);
  const [imageLibraryOpen, setImageLibraryOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [localImagePreview, setLocalImagePreview] = useState<string | null>(null);

  // Video library state
  const [videoLibrary, setVideoLibrary] = useState<NoticeVideo[]>([]);
  const [videoLibraryLoading, setVideoLibraryLoading] = useState(false);
  const [videoLibraryOpen, setVideoLibraryOpen] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [localVideoPreview, setLocalVideoPreview] = useState<string | null>(null);

  // Gallery state for carousel (full-screen mode)
  const [gallery, setGallery] = useState<NoticeGalleryItemInput[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [variant, setVariant] = useState<NoticeVariant>("info");
  const [displayMode, setDisplayMode] = useState<NoticeDisplayMode>("toast");
  const [audience, setAudience] = useState<NoticeAudience>("all");
  const [audienceZoneId, setAudienceZoneId] = useState("");
  const [audiencePlatform, setAudiencePlatform] = useState("");
  const [audienceProgram, setAudienceProgram] = useState("");
  const [audienceDeviceIds, setAudienceDeviceIds] = useState("");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 7 * 86400000)));
  const [maxDisplays, setMaxDisplays] = useState("3");
  const [dismissible, setDismissible] = useState(true);
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotices({ page, limit: 12 });
      setRows(res.rows);
      setTotalPages(Math.max(1, res.totalPages));
    } catch {
      toast.error("No se pudo cargar el tablón");
    } finally {
      setLoading(false);
    }
  }, [getNotices, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    getDeviceZones()
      .then((r) => {
        if (!cancelled) setZones(r.zones);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [getDeviceZones]);

  const resetForm = useCallback(() => {
    setEditing(null);
    setTitle("");
    setBody("");
    setImageUrl("");
    setVideoUrl("");
    setGallery([]);
    setCtaLabel("");
    setCtaUrl("");
    setVariant("info");
    setDisplayMode("toast");
    setAudience("all");
    setAudienceZoneId("");
    setAudiencePlatform("");
    setAudienceProgram("");
    setAudienceDeviceIds("");
    setStartsAt(toLocalInput(new Date()));
    setEndsAt(toLocalInput(new Date(Date.now() + 7 * 86400000)));
    setMaxDisplays("3");
    setDismissible(true);
    setIsActive(true);
    setPreviewCount(null);
    setLocalImagePreview(null);
    setLocalVideoPreview(null);
  }, []);

  const loadImageLibrary = useCallback(async () => {
    setImageLibraryLoading(true);
    try {
      const res = await getNoticeImages({ limit: 24 });
      setImageLibrary(res.rows);
    } catch {
      toast.error("No se pudo cargar la biblioteca");
    } finally {
      setImageLibraryLoading(false);
    }
  }, [getNoticeImages]);

  const loadVideoLibrary = useCallback(async () => {
    setVideoLibraryLoading(true);
    try {
      const res = await getNoticeVideos({ limit: 24 });
      setVideoLibrary(res.rows);
    } catch {
      toast.error("No se pudo cargar la biblioteca de videos");
    } finally {
      setVideoLibraryLoading(false);
    }
  }, [getNoticeVideos]);

  useEffect(() => {
    if (imageLibraryOpen) void loadImageLibrary();
  }, [imageLibraryOpen, loadImageLibrary]);

  useEffect(() => {
    if (videoLibraryOpen) void loadVideoLibrary();
  }, [videoLibraryOpen, loadVideoLibrary]);

  const handleImageUpload = async (file: File): Promise<string | null> => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Máx 20 MB");
      return null;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Solo imágenes");
      return null;
    }
    const preview = URL.createObjectURL(file);
    setLocalImagePreview(preview);
    setImageUploading(true);
    try {
      const record = await uploadNoticeImage(file);
      toast.success(`Imagen optimizada ${Math.round(record.size / 1024)} KB · ${record.width ?? "?"}×${record.height ?? "?"}`);
      await loadImageLibrary();
      return record.url;
    } catch {
      toast.error("No se pudo subir la imagen");
      return null;
    } finally {
      setImageUploading(false);
    }
  };

  const handleVideoUpload = async (file: File): Promise<string | null> => {
    if (file.size > 120 * 1024 * 1024) {
      toast.error("Máx 120 MB");
      return null;
    }
    if (!file.type.startsWith("video/")) {
      toast.error("Solo videos");
      return null;
    }
    const preview = URL.createObjectURL(file);
    setLocalVideoPreview(preview);
    setVideoUploading(true);
    try {
      const record = await uploadNoticeVideo(file);
      toast.success(`Video subido ${Math.round(record.size / 1024)} KB`);
      await loadVideoLibrary();
      return record.url;
    } catch {
      toast.error("No se pudo subir el video");
      return null;
    } finally {
      setVideoUploading(false);
    }
  };

  const handleDeleteImage = async (id: string) => {
    try {
      await deleteNoticeImage(id);
      toast.success("Imagen eliminada");
      void loadImageLibrary();
      if (imageLibrary.find((x) => x.id === id)?.url === imageUrl) setImageUrl("");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  const handleDeleteVideo = async (id: string) => {
    try {
      await deleteNoticeVideo(id);
      toast.success("Video eliminado");
      void loadVideoLibrary();
      if (videoLibrary.find((x) => x.id === id)?.url === videoUrl) setVideoUrl("");
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  // Gallery helpers for carousel (full-screen mode) — bypass single-field previews
  const handleGalleryImageUpload = async (file: File): Promise<string | null> => {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Máx 20 MB");
      return null;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Solo imágenes");
      return null;
    }
    try {
      const record = await uploadNoticeImage(file);
      await loadImageLibrary();
      return record.url;
    } catch {
      toast.error("No se pudo subir la imagen");
      return null;
    }
  };

  const handleGalleryVideoUpload = async (file: File): Promise<{ url: string; posterUrl: string | null } | null> => {
    if (file.size > 120 * 1024 * 1024) {
      toast.error("Máx 120 MB");
      return null;
    }
    if (!file.type.startsWith("video/")) {
      toast.error("Solo videos");
      return null;
    }
    try {
      const record = await uploadNoticeVideo(file);
      await loadVideoLibrary();
      return { url: record.url, posterUrl: record.posterUrl ?? null };
    } catch {
      toast.error("No se pudo subir el video");
      return null;
    }
  };

  const openEdit = (notice: AppNotice) => {
    setEditing(notice);
    setTitle(notice.title);
    setBody(notice.body);
    setImageUrl(notice.imageUrl ?? "");
    setVideoUrl((notice as unknown as { videoUrl?: string | null }).videoUrl ?? "");
    setGallery(notice.gallery ?? []);
    setCtaLabel(notice.ctaLabel ?? "");
    setCtaUrl(notice.ctaUrl ?? "");
    setVariant(notice.variant);
    setDisplayMode((notice as unknown as { displayMode?: NoticeDisplayMode }).displayMode ?? "toast");
    setAudience(notice.audience);
    setAudienceZoneId(notice.audienceZoneId ?? "");
    setAudiencePlatform(notice.audiencePlatform ?? "");
    setAudienceProgram(notice.audienceProgram ?? "");
    setAudienceDeviceIds(notice.audienceDeviceIds ? JSON.parse(notice.audienceDeviceIds).join(", ") : "");
    setStartsAt(toLocalInput(new Date(notice.startsAt)));
    setEndsAt(toLocalInput(new Date(notice.endsAt)));
    setMaxDisplays(String(notice.maxDisplaysPerUser));
    setDismissible(notice.dismissible);
    setIsActive(notice.isActive);
    setShowForm(true);
  };

  const handlePreviewAudience = async () => {
    try {
      const result = await previewNoticeAudience({
        audience,
        audienceZoneId: audienceZoneId || null,
        audiencePlatform: audiencePlatform || null,
        audienceProgram: audienceProgram || null,
        audienceDeviceIds: audienceDeviceIds ? audienceDeviceIds.split(",").map((s) => s.trim()).filter(Boolean) : null,
      } as never);
      setPreviewCount(result.targeted);
      toast.success(`${result.targeted} dispositivo${result.targeted !== 1 ? "s" : ""} alcanzados`);
    } catch {
      toast.error("No se pudo previsualizar");
    }
  };

  const handleSubmit = async () => {
    const payload: AppNoticeInput = {
      title: title.trim(),
      body: body.trim(),
      imageUrl: imageUrl.trim() || null,
      videoUrl: videoUrl.trim() || null,
      gallery: gallery.length > 0 ? gallery : undefined,
      ctaLabel: ctaLabel.trim() || null,
      ctaUrl: ctaUrl.trim() || null,
      variant,
      audience,
      audienceZoneId: audience === "zone" ? audienceZoneId.trim() || null : null,
      audiencePlatform: audience === "platform" ? audiencePlatform || null : null,
      audienceProgram: audience === "program" ? audienceProgram.trim() || null : null,
      audienceDeviceIds: audience === "devices" ? audienceDeviceIds.split(",").map((s) => s.trim()).filter(Boolean) : null,
      displayMode,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      maxDisplaysPerUser: Math.max(0, Number(maxDisplays) || 0),
      dismissible,
      isActive,
    };
    if (!payload.title || !payload.body) {
      toast.error("Título y cuerpo son obligatorios");
      return;
    }
    try {
      if (editing) await updateNotice(editing.id, payload);
      else await createNotice(payload);
      toast.success(editing ? "Aviso actualizado" : "Aviso creado");
      setShowForm(false);
      resetForm();
      void load();
    } catch {
      toast.error("No se pudo guardar");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteNotice(deleteTarget.id);
      toast.success("Aviso eliminado");
      setDeleteTarget(null);
      void load();
    } catch {
      toast.error("No se pudo eliminar");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Cabina · Tablón de avisos</p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Megaphone className="h-4 w-4" />
                </span>
                Avisos para oyentes
              </h1>
              <p className="mt-1.5 max-w-[64ch] text-sm leading-relaxed text-muted-foreground">
                Un anuncio pequeño, no un pop-up agresivo. Elige ventana, frecuencia y zona. Se muestra en web y app hasta que expire o el oyente lo
                descarte.
              </p>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="hidden shrink-0 gap-2 rounded-full sm:inline-flex"
            >
              <Pin className="h-4 w-4" />
              Nuevo aviso
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sunken px-3 py-1 font-mono text-xs">
              <Layers className="h-3 w-3 text-faint" />
              {rows.length} en esta página
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <ShieldCheck className="h-3 w-3" />
              Respeta no molestar
            </span>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="ml-auto gap-1.5 rounded-full">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          </div>
        </div>
        <div
          aria-hidden
          className="absolute left-1/2 top-0 h-6 w-28 -translate-x-1/2 rounded-b-lg bg-primary/15 backdrop-blur border border-primary/10"
          style={{ clipPath: "polygon(4% 0, 96% 0, 100% 100%, 0 100%)" }}
        />
      </div>

      <Button
        onClick={() => {
          resetForm();
          setShowForm(true);
        }}
        className="w-full gap-2 rounded-full sm:hidden"
      >
        <Pin className="h-4 w-4" />
        Nuevo aviso
      </Button>

      {/* List */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-sunken/30 py-3">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-faint" />
            <CardTitle className="text-sm">Tablón</CardTitle>
            <span className="ml-auto font-mono text-xs text-faint">{loading ? "Cargando…" : `${rows.length} avisos`}</span>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-xl bg-sunken" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-sunken/50 px-6 py-12 text-center">
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                Aún no hay avisos. Crea el primero: un recordatorio de evento, un cambio de horario o una invitación breve.
              </p>
              <Button
                onClick={() => {
                  resetForm();
                  setShowForm(true);
                }}
                className="mt-4 rounded-full"
              >
                Crear aviso
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence initial={false}>
                  {rows.map((notice, idx) => {
                    const status = getNoticeStatus(notice);
                    const cfg = VARIANT_CFG[notice.variant];
                    const mode = (notice as unknown as { displayMode?: string }).displayMode ?? "toast";
                    const gallery: Array<{ type: string; url: string; posterUrl: string | null }> = (notice as unknown as { gallery?: Array<{ type: string; url: string; posterUrl: string | null }> }).gallery ?? [];
                    const hasGallery = gallery.length > 0;
                    const video = (notice as unknown as { videoUrl?: string | null }).videoUrl ?? null;
                    return (
                      <motion.div
                        key={notice.id}
                        layout={!shouldReduceMotion}
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(idx * 0.03, 0.12) }}
                        className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm border-l-4 ${cfg.border}`}
                      >
                        <div className="flex items-center gap-2 border-b border-border bg-sunken/40 px-3 py-2">
                          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} aria-hidden />
                          <span className="font-mono text-[10px] uppercase tracking-widest text-faint">{cfg.label}</span>
                          <span
                            className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${mode === "modal" ? "border-amber-500/30 bg-amber-500/10 text-amber-700" : "border-border bg-card text-faint"}`}
                          >
                            {mode === "modal" ? "● Central" : "▬ Discreto"}
                          </span>
                          {hasGallery ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                              <Film className="h-3 w-3" />
                              Carrusel · {gallery.length}
                            </span>
                          ) : video ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                              <Film className="h-3 w-3" />
                              Video
                            </span>
                          ) : (
                            notice.imageUrl && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-faint">
                                <Layers className="h-3 w-3" />
                                Imagen
                              </span>
                            )
                          )}
                          <Badge variant="outline" className={`ml-auto rounded-full border text-xs ${status.tone}`}>
                            {status.label}
                          </Badge>
                        </div>
                        {hasGallery ? (
                          <div className="relative">
                            {gallery[0].type === "video" ? (
                              <video
                                src={resolveNoticeMediaSrc(gallery[0].url) ?? ""}
                                poster={gallery[0].posterUrl ? (resolveNoticeMediaSrc(gallery[0].posterUrl) ?? undefined) : undefined}
                                className="aspect-[16/8] w-full object-cover bg-black"
                                muted
                                playsInline
                                preload="metadata"
                              />
                            ) : (
                              <img src={resolveNoticeMediaSrc(gallery[0].url) ?? ""} alt="" className="aspect-[16/8] w-full object-cover" />
                            )}
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
                              <Film className="h-3 w-3" />
                              {gallery.length} elementos
                            </span>
                            {gallery.length > 1 && (
                              <span className="absolute bottom-2 right-2 flex gap-1">
                                {gallery.slice(0, 4).map((_, i) => (
                                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-white" : "bg-white/40"}`} aria-hidden />
                                ))}
                                {gallery.length > 4 && <span className="font-mono text-[10px] text-white">+{gallery.length - 4}</span>}
                              </span>
                            )}
                          </div>
                        ) : video ? (
                          <div className="relative">
                            <video src={resolveNoticeMediaSrc(video) ?? ""} className="aspect-[16/8] w-full object-cover bg-black" muted playsInline />
                            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[10px] text-white">
                              <Film className="h-3 w-3" />
                              Video
                            </span>
                          </div>
                        ) : notice.imageUrl ? (
                          <img src={resolveNoticeMediaSrc(notice.imageUrl) ?? ""} alt="" className="aspect-[16/8] w-full object-cover" />
                        ) : null}
                        <div className="flex flex-1 flex-col gap-2 p-3">
                          <h3 className="line-clamp-2 text-[15px] font-semibold leading-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                            {notice.title}
                          </h3>
                          <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{notice.body}</p>
                          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-sunken px-2 py-0.5 font-mono text-[11px] text-faint">
                              <Users className="h-3 w-3" />
                              {AUDIENCE_LABELS[notice.audience]}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-sunken px-2 py-0.5 font-mono text-[11px] text-faint">
                              <Clock3 className="h-3 w-3" />
                              {notice.maxDisplaysPerUser === 0 ? "∞" : `${notice.maxDisplaysPerUser}×`} por usuario
                            </span>
                          </div>
                          <p className="font-mono text-[11px] text-faint">
                            {formatDateTime(notice.startsAt)} → {formatDateTime(notice.endsAt)}
                          </p>
                          <div className="flex gap-1.5 pt-1">
                            <Button variant="outline" size="sm" onClick={() => openEdit(notice)} className="h-7 flex-1 gap-1 rounded-full text-xs">
                              <Pencil className="h-3 w-3" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteTarget(notice)}
                              className="h-7 gap-1 rounded-full text-xs text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              {totalPages > 1 && (
                <div className="pt-4">
                  <AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Form dialog */}
      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Fraunces', Georgia, serif" }}>{editing ? "Editar aviso" : "Nuevo aviso"}</DialogTitle>
            <DialogDescription>Elige si es tarjeta discreta o anuncio central que aparece al entrar. Define ventana y frecuencia. Puedes añadir imagen, video o ambos.</DialogDescription>
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
                    <SelectTrigger className="border-border bg-sunken">
                      <SelectValue />
                    </SelectTrigger>
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

              <NoticeMediaField
                kind="image"
                value={imageUrl}
                onChange={setImageUrl}
                localPreview={localImagePreview}
                onLocalPreviewChange={setLocalImagePreview}
                uploading={imageUploading}
                onUpload={handleImageUpload}
                library={imageLibrary}
                libraryLoading={imageLibraryLoading}
                libraryOpen={imageLibraryOpen}
                onLibraryOpenChange={setImageLibraryOpen}
                onLoadLibrary={loadImageLibrary}
                onDeleteFromLibrary={handleDeleteImage}
              />

              <NoticeMediaField
                kind="video"
                value={videoUrl}
                onChange={setVideoUrl}
                localPreview={localVideoPreview}
                onLocalPreviewChange={setLocalVideoPreview}
                uploading={videoUploading}
                onUpload={handleVideoUpload}
                library={videoLibrary}
                libraryLoading={videoLibraryLoading}
                libraryOpen={videoLibraryOpen}
                onLibraryOpenChange={setVideoLibraryOpen}
                onLoadLibrary={loadVideoLibrary}
                onDeleteFromLibrary={handleDeleteVideo}
              />

              {/* Carousel gallery — only for full-screen (modal) notices */}
              {displayMode === "modal" && (
                <NoticeGalleryEditor
                  value={gallery}
                  onChange={setGallery}
                  onUploadImage={handleGalleryImageUpload}
                  onUploadVideo={handleGalleryVideoUpload}
                  imageLibrary={imageLibrary}
                  videoLibrary={videoLibrary}
                />
              )}

              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-faint">CTA URL</Label>
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://..." className="border-border bg-sunken" />
              </div>

              <div className="rounded-xl border border-border bg-sunken p-3 space-y-2">
                <p className="font-mono text-xs font-medium text-faint">Modo de aparición</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDisplayMode("toast")}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${displayMode === "toast" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-sunken"}`}
                  >
                    <span className="block text-xs font-semibold">Discreto</span>
                    <span className={`block text-[11px] leading-tight ${displayMode === "toast" ? "text-primary-foreground/80" : "text-faint"}`}>Tarjeta abajo, no interrumpe</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayMode("modal")}
                    className={`rounded-xl border px-3 py-3 text-left transition-colors ${displayMode === "modal" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-sunken"}`}
                  >
                    <span className="block text-xs font-semibold">Anuncio central</span>
                    <span className={`block text-[11px] leading-tight ${displayMode === "modal" ? "text-primary-foreground/80" : "text-faint"}`}>Ocupa el centro al entrar, se cierra fácil</span>
                  </button>
                </div>
                {displayMode === "modal" && (
                  <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-amber-700 ring-1 ring-amber-500/20">
                    Modo intrusivo: aparece una sola vez al entrar (respeta máx. por usuario) y se puede cerrar con ×, clic fuera o Esc. Úsalo solo para avisos que no
                    pueden perderse.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-border bg-sunken p-3 space-y-3">
                <p className="font-mono text-xs font-medium text-faint">Audiencia — reutiliza zonas del sistema de notificaciones</p>
                <Select value={audience} onValueChange={(v) => setAudience(v as NoticeAudience)}>
                  <SelectTrigger className="border-border bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUDIENCE_LABELS) as NoticeAudience[]).map((a) => (
                      <SelectItem key={a} value={a}>
                        {AUDIENCE_LABELS[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {audience === "zone" && (
                  <div className="space-y-2">
                    <Input value={audienceZoneId} onChange={(e) => setAudienceZoneId(e.target.value)} list="notice-zones" placeholder="Ej: Cartago" className="border-border bg-card" />
                    <datalist id="notice-zones">
                      {zones.map((z) => (
                        <option key={z} value={z} />
                      ))}
                    </datalist>
                    {zones.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {zones.map((z) => (
                          <button
                            key={z}
                            onClick={() => setAudienceZoneId(z)}
                            className={`rounded-full border px-2.5 py-1 text-xs ${audienceZoneId === z ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
                          >
                            {z}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {audience === "platform" && (
                  <Select value={audiencePlatform} onValueChange={setAudiencePlatform}>
                    <SelectTrigger className="border-border bg-card">
                      <SelectValue placeholder="Plataforma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="android">Android</SelectItem>
                      <SelectItem value="ios">iOS</SelectItem>
                      <SelectItem value="web">Web</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {audience === "program" && (
                  <Input value={audienceProgram} onChange={(e) => setAudienceProgram(e.target.value)} placeholder="Ej: Amanecer con fe" className="border-border bg-card" />
                )}
                {audience === "devices" && (
                  <Textarea value={audienceDeviceIds} onChange={(e) => setAudienceDeviceIds(e.target.value)} placeholder="deviceId, deviceId..." rows={2} className="border-border bg-card font-mono text-xs" />
                )}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => void handlePreviewAudience()} className="gap-1 rounded-full">
                    <Eye className="h-3.5 w-3.5" />
                    Previsualizar alcance
                  </Button>
                  {previewCount !== null && (
                    <span className="rounded-full bg-info/10 px-2.5 py-1 font-mono text-xs text-info ring-1 ring-info/20">{previewCount} dispositivos</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 font-mono text-xs text-faint">Desde</Label>
                  <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="border-border bg-sunken" />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1 font-mono text-xs text-faint">Hasta</Label>
                  <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="border-border bg-sunken" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-sunken p-3">
                <div className="space-y-1.5">
                  <Label className="font-mono text-xs text-faint">Máx. por usuario (0 = ilimitado)</Label>
                  <Select value={maxDisplays} onValueChange={setMaxDisplays}>
                    <SelectTrigger className="border-border bg-card">
                      <SelectValue />
                    </SelectTrigger>
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
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="flex-1 rounded-full"
                >
                  Cancelar
                </Button>
                <Button onClick={() => void handleSubmit()} className="flex-1 rounded-full">
                  {editing ? "Guardar" : "Publicar aviso"}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-mono text-xs font-medium tracking-wide text-faint">Vista previa — como lo verá el oyente</p>
              <NoticePreviewCard title={title} body={body} imageUrl={imageUrl} videoUrl={videoUrl} gallery={gallery} ctaLabel={ctaLabel} variant={variant} displayMode={displayMode} />
              <div className="rounded-xl border border-dashed border-border bg-sunken/60 p-3">
                <p className="font-mono text-[11px] leading-relaxed text-faint">
                  {displayMode === "modal"
                    ? "Modo central: ocupa el centro con fondo oscuro al entrar. Se cierra con ×, clic fuera o Esc. Respeta el límite por usuario."
                    : "Modo discreto: tarjeta anclada abajo, no bloquea la reproducción. Si el oyente lo cierra, no vuelve hasta agotar el límite."}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="¿Eliminar aviso?"
        description={`Se eliminará "${deleteTarget?.title ?? ""}".`}
        confirmLabel="Eliminar"
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
