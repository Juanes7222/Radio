import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAdminApi } from "@/hooks/useAdminApi";
import { NoticePreviewCard } from "@/components/admin/notices/NoticePreviewCard";
import { NoticeMediaField } from "@/components/admin/notices/NoticeMediaField";
import { NoticeGalleryEditor } from "@/components/admin/notices/NoticeGalleryEditor";
import { AUDIENCE_LABELS, toLocalInput } from "@/components/admin/notices/noticeConfig";
import type {
  AppNotice,
  AppNoticeInput,
  NoticeAudience,
  NoticeDisplayMode,
  NoticeGalleryItemInput,
  NoticeImage,
  NoticeVideo,
  NoticeVariant,
} from "@radio/types";

interface FormErrors {
  title?: string;
  body?: string;
  dates?: string;
  ctaUrl?: string;
}

function FormSection({ step, title, hint, children }: { step: string; title: string; hint: string; children: ReactNode }) {
  return (
    <section aria-label={`${step} · ${title}`} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-primary">{step}</span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="ml-auto font-mono text-[11px] text-faint">{hint}</span>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

interface NoticeFormDialogProps {
  notice: AppNotice | null;
  zones: string[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Self-contained create/edit dialog for board notices.
 * Owns form state, media libraries, validation and submit.
 * Mounted only while open, so state always starts from the given notice.
 */
export function NoticeFormDialog({ notice, zones, onClose, onSaved }: NoticeFormDialogProps) {
  const {
    createNotice,
    updateNotice,
    previewNoticeAudience,
    getNoticeImages,
    uploadNoticeImage,
    deleteNoticeImage,
    getNoticeVideos,
    uploadNoticeVideo,
    deleteNoticeVideo,
  } = useAdminApi();

  const [previewCount, setPreviewCount] = useState<number | null>(null);

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
  const [gallery, setGallery] = useState<NoticeGalleryItemInput[]>(() => notice?.gallery ?? []);

  // Form state
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [imageUrl, setImageUrl] = useState(notice?.imageUrl ?? "");
  const [videoUrl, setVideoUrl] = useState((notice as unknown as { videoUrl?: string | null } | null)?.videoUrl ?? "");
  const [ctaLabel, setCtaLabel] = useState(notice?.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(notice?.ctaUrl ?? "");
  const [variant, setVariant] = useState<NoticeVariant>(notice?.variant ?? "info");
  const [displayMode, setDisplayMode] = useState<NoticeDisplayMode>(
    (notice as unknown as { displayMode?: NoticeDisplayMode } | null)?.displayMode ?? "toast",
  );
  const [audience, setAudience] = useState<NoticeAudience>(notice?.audience ?? "all");
  const [audienceZoneId, setAudienceZoneId] = useState(notice?.audienceZoneId ?? "");
  const [audiencePlatform, setAudiencePlatform] = useState(notice?.audiencePlatform ?? "");
  const [audienceProgram, setAudienceProgram] = useState(notice?.audienceProgram ?? "");
  const [audienceDeviceIds, setAudienceDeviceIds] = useState(
    notice?.audienceDeviceIds ? (JSON.parse(notice.audienceDeviceIds) as string[]).join(", ") : "",
  );
  const [startsAt, setStartsAt] = useState(() => (notice ? toLocalInput(new Date(notice.startsAt)) : toLocalInput(new Date())));
  const [endsAt, setEndsAt] = useState(() =>
    notice ? toLocalInput(new Date(notice.endsAt)) : toLocalInput(new Date(Date.now() + 7 * 86400000)),
  );
  const [maxDisplays, setMaxDisplays] = useState(notice ? String(notice.maxDisplaysPerUser) : "3");
  const [dismissible, setDismissible] = useState(notice?.dismissible ?? true);
  const [isActive, setIsActive] = useState(notice?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

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
    setImageUploading(true);
    try {
      const record = await uploadNoticeImage(file);
      toast.success(`Imagen optimizada ${Math.round(record.size / 1024)} KB · ${record.width ?? "?"}×${record.height ?? "?"}`);
      await loadImageLibrary();
      return record.url;
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string }; status?: number } })?.response?.data?.error ??
        (err as { response?: { status?: number } })?.response?.status === 413
          ? "Imagen demasiado grande para el servidor (límite 20 MB / 25 MB en nginx). Reduce el tamaño."
          : "No se pudo subir la imagen";
      toast.error(message);
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
    setVideoUploading(true);
    try {
      const record = await uploadNoticeVideo(file);
      toast.success(`Video subido ${Math.round(record.size / 1024)} KB`);
      await loadVideoLibrary();
      return record.url;
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: string }; status?: number } };
      const status = axiosError?.response?.status;
      const serverMsg = axiosError?.response?.data?.error;
      if (status === 413) {
        toast.error(serverMsg ?? "Video demasiado grande (límite 120 MB / 130 MB en nginx). Reduce el tamaño o comprime.");
      } else if (serverMsg) {
        toast.error(serverMsg);
      } else {
        toast.error("No se pudo subir el video. Revisa tu conexión y vuelve a intentar.");
      }
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
    const errors: FormErrors = {};
    if (!title.trim()) errors.title = "Escribe un título corto.";
    if (!body.trim()) errors.body = "Escribe el mensaje del aviso.";
    const startTime = new Date(startsAt).getTime();
    const endTime = new Date(endsAt).getTime();
    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
      errors.dates = "La fecha de fin debe ser posterior al inicio.";
    }
    const trimmedCtaUrl = ctaUrl.trim();
    if (trimmedCtaUrl && !/^https?:\/\/.+\..+/.test(trimmedCtaUrl)) {
      errors.ctaUrl = "Usa una URL https:// válida o déjalo vacío.";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error("Revisa los campos marcados");
      return;
    }
    const payload: AppNoticeInput = {
      title: title.trim(),
      body: body.trim(),
      imageUrl: imageUrl.trim() || null,
      videoUrl: videoUrl.trim() || null,
      gallery: gallery.length > 0 ? gallery : undefined,
      ctaLabel: ctaLabel.trim() || null,
      ctaUrl: trimmedCtaUrl || null,
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
    setSaving(true);
    try {
      if (notice) await updateNotice(notice.id, payload);
      else await createNotice(payload);
      toast.success(notice ? "Aviso actualizado" : "Aviso creado");
      onClose();
      onSaved();
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden border-border bg-card p-0 sm:max-w-[780px]">
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-4 pt-5 text-left sm:px-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Cabina · {notice ? "Editar aviso" : "Nuevo aviso"}</p>
          <DialogTitle className="font-display text-xl">{notice ? "Editar aviso" : "Nuevo aviso"}</DialogTitle>
          <DialogDescription>
            Elige si es tarjeta discreta o anuncio central que aparece al entrar. Define ventana y frecuencia. Puedes añadir imagen, video o ambos.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <FormSection step="01" title="Contenido" hint="Qué dirá">
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor="notice-title" className="font-mono text-xs text-faint">
                      Título
                    </Label>
                    <span className="font-mono text-[11px] text-faint">{title.length}/120</span>
                  </div>
                  <Input
                    id="notice-title"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      if (formErrors.title) setFormErrors((prev) => ({ ...prev, title: undefined }));
                    }}
                    maxLength={120}
                    placeholder="Ej: Vigilia este viernes 8PM"
                    aria-invalid={Boolean(formErrors.title)}
                    aria-describedby={formErrors.title ? "notice-title-error" : undefined}
                    className="border-border bg-sunken"
                  />
                  {formErrors.title && (
                    <p id="notice-title-error" role="alert" className="font-mono text-[11px] text-destructive">
                      {formErrors.title}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor="notice-body" className="font-mono text-xs text-faint">
                      Cuerpo · admite saltos de línea
                    </Label>
                    <span className="font-mono text-[11px] text-faint">{body.length}/2000</span>
                  </div>
                  <Textarea
                    id="notice-body"
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      if (formErrors.body) setFormErrors((prev) => ({ ...prev, body: undefined }));
                    }}
                    maxLength={2000}
                    rows={5}
                    placeholder="Mensaje breve, humano. Qué, cuándo, dónde."
                    aria-invalid={Boolean(formErrors.body)}
                    aria-describedby={formErrors.body ? "notice-body-error" : undefined}
                    className="border-border bg-sunken"
                  />
                  {formErrors.body && (
                    <p id="notice-body-error" role="alert" className="font-mono text-[11px] text-destructive">
                      {formErrors.body}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notice-variant" className="font-mono text-xs text-faint">
                    Variante
                  </Label>
                  <Select value={variant} onValueChange={(v) => setVariant(v as NoticeVariant)}>
                    <SelectTrigger id="notice-variant" className="border-border bg-sunken">
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
                <div className="space-y-3 rounded-xl border border-border bg-sunken p-3">
                  <p className="font-mono text-xs font-medium text-faint">Llamado a la acción · opcional</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="notice-cta-label" className="font-mono text-xs text-faint">
                      Etiqueta
                    </Label>
                    <Input
                      id="notice-cta-label"
                      value={ctaLabel}
                      onChange={(e) => setCtaLabel(e.target.value)}
                      placeholder="Ej: Ver detalles"
                      className="border-border bg-card"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notice-cta-url" className="font-mono text-xs text-faint">
                      URL
                    </Label>
                    <Input
                      id="notice-cta-url"
                      value={ctaUrl}
                      onChange={(e) => {
                        setCtaUrl(e.target.value);
                        if (formErrors.ctaUrl) setFormErrors((prev) => ({ ...prev, ctaUrl: undefined }));
                      }}
                      placeholder="https://..."
                      inputMode="url"
                      aria-invalid={Boolean(formErrors.ctaUrl)}
                      aria-describedby={formErrors.ctaUrl ? "notice-cta-url-error" : undefined}
                      className="border-border bg-card font-mono text-xs"
                    />
                    {formErrors.ctaUrl ? (
                      <p id="notice-cta-url-error" role="alert" className="font-mono text-[11px] text-destructive">
                        {formErrors.ctaUrl}
                      </p>
                    ) : (
                      <p className="font-mono text-[11px] leading-relaxed text-faint">Se muestra como botón solo si hay etiqueta. Vacío = sin botón.</p>
                    )}
                  </div>
                </div>
              </FormSection>
              <FormSection step="02" title="Presentación" hint="Cómo se muestra">
                <div className="space-y-2">
                  <p id="notice-display-mode-label" className="font-mono text-xs font-medium text-faint">
                    Modo de aparición
                  </p>
                  <div role="radiogroup" aria-labelledby="notice-display-mode-label" className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={displayMode === "toast"}
                      onClick={() => setDisplayMode("toast")}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${displayMode === "toast" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-sunken"}`}
                    >
                      <span className="block text-xs font-semibold">Discreto</span>
                      <span className={`block text-[11px] leading-tight ${displayMode === "toast" ? "text-primary-foreground/80" : "text-faint"}`}>
                        Tarjeta abajo, no interrumpe
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={displayMode === "modal"}
                      onClick={() => setDisplayMode("modal")}
                      className={`rounded-xl border px-3 py-3 text-left transition-colors ${displayMode === "modal" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-sunken"}`}
                    >
                      <span className="block text-xs font-semibold">Anuncio central</span>
                      <span className={`block text-[11px] leading-tight ${displayMode === "modal" ? "text-primary-foreground/80" : "text-faint"}`}>
                        Ocupa el centro al entrar, se cierra fácil
                      </span>
                    </button>
                  </div>
                  {displayMode === "modal" && (
                    <p className="rounded-lg bg-warning/10 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-warning ring-1 ring-warning/20">
                      Modo intrusivo: aparece una sola vez al entrar (respeta máx. por usuario) y se puede cerrar con ×, clic fuera o Esc. Úsalo solo para avisos que
                      no pueden perderse.
                    </p>
                  )}
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
              </FormSection>

              <FormSection step="03" title="Alcance y vigencia" hint="Quién y cuándo">
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
                  <div className="min-h-[92px]" aria-live="polite">
                    {audience === "zone" && (
                      <div className="space-y-2">
                        <Input
                          value={audienceZoneId}
                          onChange={(e) => setAudienceZoneId(e.target.value)}
                          list="notice-zones"
                          placeholder="Ej: Cartago"
                          className="border-border bg-card"
                        />
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
                                type="button"
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
                      <Input
                        value={audienceProgram}
                        onChange={(e) => setAudienceProgram(e.target.value)}
                        placeholder="Ej: Amanecer con fe"
                        className="border-border bg-card"
                      />
                    )}
                    {audience === "devices" && (
                      <Textarea
                        value={audienceDeviceIds}
                        onChange={(e) => setAudienceDeviceIds(e.target.value)}
                        placeholder="deviceId, deviceId..."
                        rows={2}
                        className="border-border bg-card font-mono text-xs"
                      />
                    )}
                    {audience === "all" && (
                      <p className="font-mono text-[11px] leading-relaxed text-faint">Llega a todos los dispositivos con avisos activos.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => void handlePreviewAudience()} className="gap-1 rounded-full">
                      <Eye className="h-3.5 w-3.5" />
                      Previsualizar alcance
                    </Button>
                    {previewCount !== null && (
                      <span className="rounded-full bg-info/10 px-2.5 py-1 font-mono text-xs text-info ring-1 ring-info/20">
                        {previewCount} dispositivos
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="notice-starts-at" className="flex items-center gap-1 font-mono text-xs text-faint">
                      Desde
                    </Label>
                    <Input
                      id="notice-starts-at"
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => {
                        setStartsAt(e.target.value);
                        if (formErrors.dates) setFormErrors((prev) => ({ ...prev, dates: undefined }));
                      }}
                      className="border-border bg-sunken"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="notice-ends-at" className="flex items-center gap-1 font-mono text-xs text-faint">
                      Hasta
                    </Label>
                    <Input
                      id="notice-ends-at"
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => {
                        setEndsAt(e.target.value);
                        if (formErrors.dates) setFormErrors((prev) => ({ ...prev, dates: undefined }));
                      }}
                      className="border-border bg-sunken"
                    />
                  </div>
                </div>
                {formErrors.dates && (
                  <p role="alert" className="font-mono text-[11px] text-destructive">
                    {formErrors.dates}
                  </p>
                )}

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
              </FormSection>
            </div>

            <div className="space-y-3 md:sticky md:top-0 md:self-start">
              <p className="font-mono text-xs font-medium tracking-wide text-faint">Vista previa — como lo verá el oyente</p>
              <NoticePreviewCard
                title={title}
                body={body}
                imageUrl={imageUrl}
                videoUrl={videoUrl}
                gallery={gallery}
                ctaLabel={ctaLabel}
                variant={variant}
                displayMode={displayMode}
              />
              <div className="rounded-xl border border-dashed border-border bg-sunken/60 p-3">
                <p className="font-mono text-[11px] leading-relaxed text-faint">
                  {displayMode === "modal"
                    ? "Modo central: ocupa el centro con fondo oscuro al entrar. Se cierra con ×, clic fuera o Esc. Respeta el límite por usuario."
                    : "Modo discreto: tarjeta anclada abajo, no bloquea la reproducción. Si el oyente lo cierra, no vuelve hasta agotar el límite."}
                </p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t border-border bg-card px-5 py-4 sm:px-6">
          <div className="flex w-full gap-2">
            <Button variant="outline" disabled={saving} onClick={onClose} className="flex-1 rounded-full">
              Cancelar
            </Button>
            <Button
              disabled={saving || !title.trim() || !body.trim()}
              aria-busy={saving}
              onClick={() => void handleSubmit()}
              className="flex-1 rounded-full"
            >
              {saving ? "Guardando…" : notice ? "Guardar" : "Publicar aviso"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
