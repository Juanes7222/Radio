import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAdminApi } from "@/hooks/useAdminApi";
import { NoticePreviewCard } from "@/components/admin/notices/NoticePreviewCard";
import { AUDIENCE_LABELS, toLocalInput } from "@/components/admin/notices/noticeConfig";
import { NoticeWizardStepper } from "@/components/admin/notices/steps/NoticeWizardStepper";
import { NoticeContentStep } from "@/components/admin/notices/steps/NoticeContentStep";
import { NoticePresentationStep } from "@/components/admin/notices/steps/NoticePresentationStep";
import { NoticeScheduleStep } from "@/components/admin/notices/steps/NoticeScheduleStep";
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

interface NoticeFormDialogProps {
  notice: AppNotice | null;
  zones: string[];
  onClose: () => void;
  onSaved: () => void;
}

const WIZARD_STEPS = [
  { id: "content", index: "01", label: "Contenido", hint: "Qué dirá" },
  { id: "presentation", index: "02", label: "Presentación", hint: "Cómo se muestra" },
  { id: "schedule", index: "03", label: "Alcance y vigencia", hint: "Quién y cuándo" },
];

/**
 * Wizard dialog for board notices.
 * Three short steps instead of one endless column, with a live listener preview.
 * Rendered in a Radix portal, so it carries its own admin-theme scope to keep
 * the signal-amber tokens instead of falling back to the public indigo theme.
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

  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<boolean[]>([true, false, false]);
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

  const validateContentStep = (): FormErrors => {
    const errors: FormErrors = {};
    if (!title.trim()) errors.title = "Escribe un título corto.";
    if (!body.trim()) errors.body = "Escribe el mensaje del aviso.";
    const trimmedCtaUrl = ctaUrl.trim();
    if (trimmedCtaUrl && !/^https?:\/\/.+\..+/.test(trimmedCtaUrl)) {
      errors.ctaUrl = "Usa una URL https:// válida o déjalo vacío.";
    }
    return errors;
  };

  const validateScheduleStep = (): FormErrors => {
    const errors: FormErrors = {};
    const startTime = new Date(startsAt).getTime();
    const endTime = new Date(endsAt).getTime();
    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
      errors.dates = "La fecha de fin debe ser posterior al inicio.";
    }
    return errors;
  };

  const goToStep = (next: number) => {
    setStep(next);
    setVisited((prev) => prev.map((v, i) => v || i <= next));
  };

  const handleNext = () => {
    if (step === 0) {
      const errors = validateContentStep();
      setFormErrors((prev) => ({ ...prev, ...errors, dates: undefined }));
      if (Object.keys(errors).length > 0) {
        toast.error("Revisa el contenido antes de continuar");
        return;
      }
    }
    goToStep(Math.min(step + 1, WIZARD_STEPS.length - 1));
  };

  const handleSubmit = async () => {
    const errors: FormErrors = { ...validateContentStep(), ...validateScheduleStep() };
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      if (errors.title || errors.body || errors.ctaUrl) goToStep(0);
      else if (errors.dates) goToStep(2);
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

  const contentDone = title.trim().length > 0 && body.trim().length > 0 && !formErrors.title && !formErrors.body && !formErrors.ctaUrl;
  const completed = [visited[0] && contentDone, visited[1], visited[2] && !formErrors.dates];
  const stepHasError = [
    Boolean(formErrors.title || formErrors.body || formErrors.ctaUrl),
    false,
    Boolean(formErrors.dates),
  ];
  const isLast = step === WIZARD_STEPS.length - 1;
  const canPublish = title.trim().length > 0 && body.trim().length > 0;
  const audienceSummary = AUDIENCE_LABELS[audience];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="admin-theme flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden border-border bg-background p-0 text-foreground sm:max-w-[920px]">
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-4 pt-5 text-left sm:px-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Cabina · {notice ? "Editar aviso" : "Nuevo aviso"}</p>
          <DialogTitle className="font-display text-xl">{notice ? "Editar aviso" : "Nuevo aviso"}</DialogTitle>
          <DialogDescription>
            Tres pasos cortos: qué dice, cómo aparece y a quién llega. La vista previa sigue al oyente en todo momento.
          </DialogDescription>
        </DialogHeader>

        <NoticeWizardStepper steps={WIZARD_STEPS} current={step} completed={completed} hasError={stepHasError} onGoTo={goToStep} />

        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_300px]">
            <div key={step}>
              {step === 0 && (
                <NoticeContentStep
                  title={title}
                  onTitleChange={(v) => {
                    setTitle(v);
                    if (formErrors.title) setFormErrors((prev) => ({ ...prev, title: undefined }));
                  }}
                  body={body}
                  onBodyChange={(v) => {
                    setBody(v);
                    if (formErrors.body) setFormErrors((prev) => ({ ...prev, body: undefined }));
                  }}
                  variant={variant}
                  onVariantChange={setVariant}
                  ctaLabel={ctaLabel}
                  onCtaLabelChange={setCtaLabel}
                  ctaUrl={ctaUrl}
                  onCtaUrlChange={(v) => {
                    setCtaUrl(v);
                    if (formErrors.ctaUrl) setFormErrors((prev) => ({ ...prev, ctaUrl: undefined }));
                  }}
                  errors={formErrors}
                />
              )}
              {step === 1 && (
                <NoticePresentationStep
                  displayMode={displayMode}
                  onDisplayModeChange={setDisplayMode}
                  imageUrl={imageUrl}
                  onImageUrlChange={setImageUrl}
                  localImagePreview={localImagePreview}
                  onLocalImagePreviewChange={setLocalImagePreview}
                  imageUploading={imageUploading}
                  onImageUpload={handleImageUpload}
                  imageLibrary={imageLibrary}
                  imageLibraryLoading={imageLibraryLoading}
                  imageLibraryOpen={imageLibraryOpen}
                  onImageLibraryOpenChange={setImageLibraryOpen}
                  onLoadImageLibrary={() => void loadImageLibrary()}
                  onDeleteImage={(id) => void handleDeleteImage(id)}
                  videoUrl={videoUrl}
                  onVideoUrlChange={setVideoUrl}
                  localVideoPreview={localVideoPreview}
                  onLocalVideoPreviewChange={setLocalVideoPreview}
                  videoUploading={videoUploading}
                  onVideoUpload={handleVideoUpload}
                  videoLibrary={videoLibrary}
                  videoLibraryLoading={videoLibraryLoading}
                  videoLibraryOpen={videoLibraryOpen}
                  onVideoLibraryOpenChange={setVideoLibraryOpen}
                  onLoadVideoLibrary={() => void loadVideoLibrary()}
                  onDeleteVideo={(id) => void handleDeleteVideo(id)}
                  gallery={gallery}
                  onGalleryChange={setGallery}
                  onUploadGalleryImage={handleGalleryImageUpload}
                  onUploadGalleryVideo={handleGalleryVideoUpload}
                />
              )}
              {step === 2 && (
                <NoticeScheduleStep
                  audience={audience}
                  onAudienceChange={setAudience}
                  audienceZoneId={audienceZoneId}
                  onAudienceZoneIdChange={setAudienceZoneId}
                  audiencePlatform={audiencePlatform}
                  onAudiencePlatformChange={setAudiencePlatform}
                  audienceProgram={audienceProgram}
                  onAudienceProgramChange={setAudienceProgram}
                  audienceDeviceIds={audienceDeviceIds}
                  onAudienceDeviceIdsChange={setAudienceDeviceIds}
                  zones={zones}
                  previewCount={previewCount}
                  onPreviewAudience={() => void handlePreviewAudience()}
                  startsAt={startsAt}
                  onStartsAtChange={(v) => {
                    setStartsAt(v);
                    if (formErrors.dates) setFormErrors((prev) => ({ ...prev, dates: undefined }));
                  }}
                  endsAt={endsAt}
                  onEndsAtChange={(v) => {
                    setEndsAt(v);
                    if (formErrors.dates) setFormErrors((prev) => ({ ...prev, dates: undefined }));
                  }}
                  datesError={formErrors.dates}
                  maxDisplays={maxDisplays}
                  onMaxDisplaysChange={setMaxDisplays}
                  dismissible={dismissible}
                  onDismissibleChange={setDismissible}
                  isActive={isActive}
                  onIsActiveChange={setIsActive}
                />
              )}
            </div>

            <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-mono text-xs font-medium tracking-wide text-faint">Vista previa · oyente</p>
                <span className="font-mono text-[10px] text-faint">{audienceSummary}</span>
              </div>
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
          <div className="flex w-full items-center gap-2">
            {step > 0 ? (
              <Button variant="outline" disabled={saving} onClick={() => goToStep(step - 1)} className="gap-1.5 rounded-full">
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </Button>
            ) : (
              <Button variant="outline" disabled={saving} onClick={onClose} className="rounded-full">
                Cancelar
              </Button>
            )}
            <span aria-hidden className="mx-1 hidden items-center gap-1.5 sm:flex">
              {WIZARD_STEPS.map((s, i) => (
                <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />
              ))}
            </span>
            <span className="flex-1" />
            {!isLast && (
              <Button variant="ghost" disabled={saving} onClick={onClose} className="rounded-full">
                Cancelar
              </Button>
            )}
            {isLast ? (
              <Button disabled={saving || !canPublish} aria-busy={saving} onClick={() => void handleSubmit()} className="rounded-full px-6">
                {saving ? "Guardando…" : notice ? "Guardar" : "Publicar aviso"}
              </Button>
            ) : (
              <Button onClick={handleNext} className="gap-1.5 rounded-full px-6">
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
