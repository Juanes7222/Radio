import { useCallback } from "react";
import { Trash2, GripVertical, Image as ImageIcon, Film, Plus, Upload, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/config";
import { resolveNoticeMediaSrc } from "@/lib/noticeMedia";
import type { NoticeGalleryItemInput } from "@radio/types";

interface Props {
  value: NoticeGalleryItemInput[];
  onChange: (next: NoticeGalleryItemInput[]) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  onUploadVideo: (file: File) => Promise<{ url: string; posterUrl: string | null } | null>;
  imageLibrary: Array<{ id: string; url: string; posterUrl?: string | null; originalName: string; size: number }>;
  videoLibrary: Array<{ id: string; url: string; posterUrl: string | null; originalName: string; size: number }>;
}

const MAX_ITEMS = 10;

/**
 * Carousel gallery editor for full-screen notices.
 * Supports up to 10 mixed image/video items with reordering.
 * Visual style: filmstrip perforations + tape-deck controls.
 */
export function NoticeGalleryEditor({ value, onChange, onUploadImage, onUploadVideo, imageLibrary, videoLibrary }: Props) {
  const canAdd = value.length < MAX_ITEMS;

  const handleAddImageFile = useCallback(
    async (file: File) => {
      if (!canAdd) return;
      const url = await onUploadImage(file);
      if (url) onChange([...value, { type: "image", url, posterUrl: null, sortOrder: value.length }]);
    },
    [canAdd, onUploadImage, value, onChange]
  );

  const handleAddVideoFile = useCallback(
    async (file: File) => {
      if (!canAdd) return;
      const result = await onUploadVideo(file);
      if (result) onChange([...value, { type: "video", url: result.url, posterUrl: result.posterUrl, sortOrder: value.length }]);
    },
    [canAdd, onUploadVideo, value, onChange]
  );

  const handleRemove = (idx: number) => {
    const next = value.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sortOrder: i }));
    onChange(next);
  };

  const handleMove = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    onChange(next.map((item, i) => ({ ...item, sortOrder: i })));
  };

  const handlePickFromLibrary = (type: "image" | "video", url: string, posterUrl: string | null = null) => {
    if (!canAdd) return;
    onChange([...value, { type, url, posterUrl, sortOrder: value.length }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs font-medium text-faint">Carrusel — {value.length}/{MAX_ITEMS} elementos (solo para anuncio central)</p>
        <span className="font-mono text-[10px] text-faint">Autoavance 4s · manual con flechas</span>
      </div>

      {/* Filmstrip preview */}
      {value.length > 0 ? (
        <div className="relative overflow-hidden rounded-xl border border-border bg-sunken">
          {/* Perforations top */}
          <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="h-2 w-2 rounded-sm bg-border" aria-hidden />
            ))}
            <span className="ml-auto font-mono text-[10px] tracking-widest text-faint">CINTA · {value.length} FOTOGRAMAS</span>
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2">
            {value.map((item, idx) => {
              const thumb = item.type === "video" && item.posterUrl ? resolveNoticeMediaSrc(item.posterUrl) : resolveNoticeMediaSrc(item.url);
              return (
                <div key={`${item.url}-${idx}`} className="group relative overflow-hidden rounded-lg border border-border bg-card">
                  <div className="relative aspect-[16/10] overflow-hidden bg-black">
                    {item.type === "image" ? (
                      <img src={thumb ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <>
                        {thumb && thumb !== resolveNoticeMediaSrc(item.url) ? (
                          <img src={thumb ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <video src={resolveNoticeMediaSrc(item.url) ?? ""} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                        )}
                        <span className="absolute inset-0 grid place-items-center bg-black/25">
                          <Film className="h-6 w-6 text-white drop-shadow" />
                        </span>
                      </>
                    )}
                    <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                      {item.type === "image" ? <ImageIcon className="h-3 w-3" /> : <Film className="h-3 w-3" />}
                      {idx + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-card px-1.5 py-1">
                    <span className="truncate font-mono text-[10px] text-faint" title={item.url}>
                      {item.url.split("/").pop()}
                    </span>
                    <div className="ml-auto flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleMove(idx, -1)}
                        disabled={idx === 0}
                        className="rounded p-1 text-faint hover:bg-accent hover:text-foreground disabled:opacity-30"
                        aria-label="Mover arriba"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 1)}
                        disabled={idx === value.length - 1}
                        className="rounded p-1 text-faint hover:bg-accent hover:text-foreground disabled:opacity-30"
                        aria-label="Mover abajo"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(idx)}
                        className="rounded p-1 text-faint hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* Grip */}
                  <span className="pointer-events-none absolute bottom-1 left-1 hidden text-border sm:block" aria-hidden>
                    <GripVertical className="h-3 w-3" />
                  </span>
                </div>
              );
            })}
          </div>
          {/* Perforations bottom */}
          <div className="flex items-center gap-1 border-t border-border bg-card px-2 py-1.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="h-2 w-2 rounded-sm bg-border" aria-hidden />
            ))}
            <span className="ml-auto font-mono text-[10px] text-faint">Auto · 4s</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-sunken/50 px-4 py-8 text-center">
          <p className="font-mono text-xs text-muted-foreground">Sin elementos. Añade imágenes o vídeos para el carrusel.</p>
          <p className="mt-1 font-mono text-[11px] text-faint">Si está vacío, se usará la imagen/vídeo único del formulario.</p>
        </div>
      )}

      {/* Add controls */}
      <div className="grid gap-2 sm:grid-cols-2">
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm font-medium transition-colors ${!canAdd ? "opacity-40 pointer-events-none border-border bg-sunken text-faint" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"}`}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => void handleAddImageFile(e.target.files?.[0] as File)}
            disabled={!canAdd}
          />
          <Upload className="h-4 w-4" />
          Añadir imagen
        </label>
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm font-medium transition-colors ${!canAdd ? "opacity-40 pointer-events-none border-border bg-sunken text-faint" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"}`}
        >
          <input
            type="file"
            accept="video/mp4,video/webm,video/ogg,video/quicktime,video/*"
            className="hidden"
            onChange={(e) => void handleAddVideoFile(e.target.files?.[0] as File)}
            disabled={!canAdd}
          />
          <Upload className="h-4 w-4" />
          Añadir vídeo
        </label>
      </div>

      {/* Quick pick from libraries */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-2">
          <p className="mb-2 font-mono text-[11px] text-faint">Biblioteca imágenes · {imageLibrary.length}</p>
          <div className="grid max-h-[160px] grid-cols-3 gap-1.5 overflow-y-auto pr-1">
            {imageLibrary.slice(0, 9).map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => handlePickFromLibrary("image", img.url)}
                disabled={!canAdd}
                className="group relative overflow-hidden rounded border border-border bg-sunken hover:border-primary disabled:opacity-40"
              >
                <img src={`${API_BASE_URL}${img.url}`} alt={img.originalName} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/20">
                  <Plus className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
                </span>
              </button>
            ))}
            {imageLibrary.length === 0 && <p className="col-span-3 py-2 text-center font-mono text-xs text-faint">Vacía</p>}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-2">
          <p className="mb-2 font-mono text-[11px] text-faint">Biblioteca vídeos · {videoLibrary.length}</p>
          <div className="grid max-h-[160px] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
            {videoLibrary.slice(0, 6).map((vid) => (
              <button
                key={vid.id}
                type="button"
                onClick={() => handlePickFromLibrary("video", vid.url, vid.posterUrl ?? null)}
                disabled={!canAdd}
                className="group relative overflow-hidden rounded border border-border bg-sunken hover:border-primary disabled:opacity-40"
              >
                {vid.posterUrl ? (
                  <img src={`${API_BASE_URL}${vid.posterUrl}`} alt={vid.originalName} className="aspect-video w-full object-cover" loading="lazy" />
                ) : (
                  <video src={`${API_BASE_URL}${vid.url}`} className="aspect-video w-full object-cover bg-black" muted playsInline preload="metadata" />
                )}
                <span className="absolute inset-0 grid place-items-center bg-black/20">
                  <Plus className="h-5 w-5 text-white" />
                </span>
              </button>
            ))}
            {videoLibrary.length === 0 && <p className="col-span-2 py-2 text-center font-mono text-xs text-faint">Vacía</p>}
          </div>
        </div>
      </div>

      {!canAdd && <p className="font-mono text-xs text-warning">Límite de {MAX_ITEMS} alcanzado. Elimina uno para añadir otro.</p>}
    </div>
  );
}
