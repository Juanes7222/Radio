import { Trash2, RefreshCw, Layers, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_BASE_URL } from "@/config";
import { resolveNoticeMediaSrc } from "@/lib/noticeMedia";
import type { NoticeImage, NoticeVideo } from "@radio/types";

type MediaKind = "image" | "video";

interface Props {
  kind: MediaKind;
  value: string;
  onChange: (url: string) => void;
  localPreview: string | null;
  onLocalPreviewChange: (url: string | null) => void;
  uploading: boolean;
  onUpload: (file: File) => Promise<string | null>;
  library: Array<NoticeImage | NoticeVideo>;
  libraryLoading: boolean;
  libraryOpen: boolean;
  onLibraryOpenChange: (open: boolean) => void;
  onLoadLibrary: () => void;
  onDeleteFromLibrary: (id: string) => void;
}

const KIND_CONFIG: Record<MediaKind, { label: string; accept: string; placeholder: string; hint: string; buttonLabel: string }> = {
  image: {
    label: "Imagen para popup — sube, elige de biblioteca o pega URL",
    accept: "image/jpeg,image/png,image/webp,image/gif,image/avif",
    placeholder: "https://... o /media/notices/xxx.webp (se autocompleta al subir)",
    hint: "Límite 20 MB. Al subir se optimiza a máx 1280×900, WebP quality 82 y se eliminan metadatos. Queda en el servidor para reusar. También puedes pegar un enlace externo.",
    buttonLabel: "Subir imagen (max 20 MB)",
  },
  video: {
    label: "Video para popup — sube, elige de biblioteca o pega URL",
    accept: "video/mp4,video/webm,video/ogg,video/quicktime,video/*",
    placeholder: "https://... o /media/notice-videos/xxx.mp4 (se autocompleta al subir)",
    hint: "Límite 120 MB. Formatos: MP4, WebM, OGG, MOV. Se optimiza a 720p H.264 y se genera miniatura WebP para redes lentas. Si hay video e imagen, el video se muestra primero. También puedes pegar un enlace externo.",
    buttonLabel: "Subir video (max 120 MB)",
  },
};

/**
 * Reusable field for notice image or video selection.
 * Handles upload, local preview, URL input and library picker.
 */
export function NoticeMediaField({
  kind,
  value,
  onChange,
  localPreview,
  onLocalPreviewChange,
  uploading,
  onUpload,
  library,
  libraryLoading,
  libraryOpen,
  onLibraryOpenChange,
  onLoadLibrary,
  onDeleteFromLibrary,
}: Props) {
  const cfg = KIND_CONFIG[kind];
  const resolved = resolveNoticeMediaSrc(value);
  const previewSrc = resolved ?? localPreview;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    onLocalPreviewChange(preview);
    const url = await onUpload(file);
    if (url) {
      onChange(url);
      onLocalPreviewChange(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-xs text-faint flex items-center gap-1">
        {kind === "video" ? <Film className="h-3.5 w-3.5" /> : null}
        {cfg.label}
      </Label>
      <div className="rounded-xl border border-border bg-sunken p-3 space-y-3">
        {previewSrc && (
          <div className="relative overflow-hidden rounded-lg border border-border bg-black">
            {kind === "image" ? (
              <img src={previewSrc} alt="Preview" className="aspect-[16/7] w-full object-cover" />
            ) : (
              <video src={previewSrc} controls playsInline className="aspect-[16/9] w-full object-contain bg-black" />
            )}
            <button
              onClick={() => {
                onChange("");
                onLocalPreviewChange(null);
              }}
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm font-medium transition-colors ${uploading ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"}`}
          >
            <input type="file" accept={cfg.accept} className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} disabled={uploading} />
            <RefreshCw className={`h-4 w-4 ${uploading ? "animate-spin" : ""}`} />
            {uploading ? (kind === "image" ? "Optimizando…" : "Subiendo…") : cfg.buttonLabel}
          </label>
          <Button type="button" variant="outline" className="rounded-lg" onClick={() => onLibraryOpenChange(!libraryOpen)}>
            <Layers className="h-4 w-4" />
            {libraryOpen ? "Cerrar" : "Biblioteca"}
          </Button>
        </div>

        <Input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            onLocalPreviewChange(null);
          }}
          placeholder={cfg.placeholder}
          className="border-border bg-card font-mono text-xs"
        />
        <p className="font-mono text-[11px] leading-relaxed text-faint">{cfg.hint}</p>

        {libraryOpen && (
          <div className="rounded-lg border border-border bg-card p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs text-faint">
                Biblioteca · {library.length} {kind === "image" ? "imágenes" : "videos"}
              </span>
              <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs" onClick={() => void onLoadLibrary()} disabled={libraryLoading}>
                <RefreshCw className={`h-3 w-3 ${libraryLoading ? "animate-spin" : ""}`} /> Recargar
              </Button>
            </div>
            {libraryLoading ? (
              <div className={`grid gap-2 ${kind === "image" ? "grid-cols-3" : "grid-cols-2"}`}>
                {Array.from({ length: kind === "image" ? 6 : 4 }).map((_, i) => (
                  <div key={i} className={`${kind === "image" ? "aspect-[4/3]" : "aspect-video"} animate-pulse rounded-lg bg-sunken`} />
                ))}
              </div>
            ) : library.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Aún no hay {kind === "image" ? "imágenes" : "videos"} subidos.</p>
            ) : (
              <div className={`grid max-h-[260px] gap-2 overflow-y-auto pr-1 ${kind === "image" ? "grid-cols-3" : "grid-cols-2"}`}>
                {library.map((item) => (
                  <div
                    key={item.id}
                    className={`group relative overflow-hidden rounded-lg border ${value === item.url ? "border-primary ring-1 ring-primary" : "border-border"} bg-sunken`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onChange(item.url);
                        onLocalPreviewChange(null);
                      }}
                      className="block w-full relative"
                    >
                      {kind === "image" ? (
                        <img src={`${API_BASE_URL}${item.url}`} alt={item.originalName} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                      ) : (
                        <>
                          {(item as NoticeVideo).posterUrl ? (
                            <img
                              src={`${API_BASE_URL}${(item as NoticeVideo).posterUrl}`}
                              alt={item.originalName}
                              className="aspect-video w-full object-cover bg-black"
                              loading="lazy"
                            />
                          ) : (
                            <video src={`${API_BASE_URL}${item.url}`} className="aspect-video w-full object-cover bg-black" muted playsInline preload="metadata" />
                          )}
                          <span className="absolute inset-0 grid place-items-center bg-black/20">
                            <Film className="h-6 w-6 text-white drop-shadow" />
                          </span>
                        </>
                      )}
                    </button>
                    <div className="flex items-center justify-between gap-1 bg-card px-1.5 py-1">
                      <span className="truncate font-mono text-[10px] text-faint" title={item.originalName}>
                        {Math.round(item.size / 1024)} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => void onDeleteFromLibrary(item.id)}
                        className="rounded-full p-1 text-faint hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    {value === item.url && (
                      <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground">
                        Usando
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
