import { ExternalLink } from "lucide-react";
import { resolveNoticeMediaSrc, resolveVideoPosterSrc } from "@/lib/noticeMedia";
import type { NoticeVariant, NoticeDisplayMode } from "@radio/types";

/**
 * Visual preview of how a notice will appear to listeners.
 * Supports both display modes (toast/modal) and media types (image/video).
 */

const VARIANT_CFG: Record<NoticeVariant, { label: string; dot: string; border: string; badge: string }> = {
  info: { label: "Informativo", dot: "bg-info", border: "border-l-info", badge: "bg-info/10 text-info border-info/20" },
  event: { label: "Evento", dot: "bg-primary", border: "border-l-primary", badge: "bg-primary/10 text-primary border-primary/20" },
  warning: { label: "Urgente", dot: "bg-warning", border: "border-l-warning", badge: "bg-warning/10 text-warning border-warning/20" },
  prayer: { label: "Oración", dot: "bg-success", border: "border-l-success", badge: "bg-success/10 text-success border-success/20" },
};

interface Props {
  title: string;
  body: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  gallery?: Array<{ type: "image" | "video"; url: string; posterUrl: string | null }>;
  ctaLabel?: string | null;
  variant: NoticeVariant;
  displayMode: NoticeDisplayMode;
}

export function NoticePreviewCard({ title, body, imageUrl, videoUrl, gallery, ctaLabel, variant, displayMode }: Props) {
  const cfg = VARIANT_CFG[variant];
  const resolvedImage = resolveNoticeMediaSrc(imageUrl ?? null);
  const resolvedVideo = resolveNoticeMediaSrc(videoUrl ?? null);
  const resolvedPoster = resolveVideoPosterSrc(videoUrl ?? null);
  const hasGallery = !!(gallery && gallery.length > 0);
  const firstGallery = hasGallery ? gallery![0] : null;
  const galleryPoster = firstGallery?.type === "video" && firstGallery.posterUrl ? resolveNoticeMediaSrc(firstGallery.posterUrl) : null;
  const galleryMedia = firstGallery ? resolveNoticeMediaSrc(firstGallery.url) : null;

  const mediaNode = hasGallery ? (
    firstGallery?.type === "video" ? (
      <div className="relative">
        <video src={galleryMedia ?? ""} poster={galleryPoster ?? undefined} controls muted playsInline preload="metadata" className="aspect-[16/8] w-full object-cover bg-black" />
        {gallery!.length > 1 && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1">
            {gallery!.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-white" : "bg-white/40"}`} aria-hidden />
            ))}
          </span>
        )}
      </div>
    ) : (
      <div className="relative">
        <img src={galleryMedia ?? ""} alt="" className="aspect-[16/8] w-full object-cover" />
        {gallery!.length > 1 && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1">
            {gallery!.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-white" : "bg-white/40"}`} aria-hidden />
            ))}
          </span>
        )}
      </div>
    )
  ) : resolvedVideo ? (
    <video src={resolvedVideo} poster={resolvedPoster ?? undefined} controls muted playsInline preload="metadata" className="aspect-[16/8] w-full object-cover bg-black" />
  ) : resolvedImage ? (
    <img src={resolvedImage} alt="" className="aspect-[16/8] w-full object-cover" />
  ) : null;

  const toastMediaNode = hasGallery ? (
    firstGallery?.type === "video" ? (
      <video src={galleryMedia ?? ""} poster={galleryPoster ?? undefined} controls muted playsInline preload="metadata" className="aspect-[16/7] w-full object-cover bg-black" />
    ) : (
      <img src={galleryMedia ?? ""} alt="" className="aspect-[16/7] w-full object-cover" />
    )
  ) : resolvedVideo ? (
    <video src={resolvedVideo} poster={resolvedPoster ?? undefined} controls muted playsInline preload="metadata" className="aspect-[16/7] w-full object-cover bg-black" />
  ) : resolvedImage ? (
    <img src={resolvedImage} alt="" className="aspect-[16/7] w-full object-cover" />
  ) : null;

  if (displayMode === "modal") {
    return (
      <div
        className={`overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_16px_40px_rgba(0,0,0,0.35)] border-t-4 ${cfg.border.replace("border-l-", "border-t-")}`}
      >
        <div className="relative flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2.5">
          <span className="flex items-center gap-2">
            <span className="relative grid h-2 w-2 place-items-center" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-tally/40" />
              <span className="relative h-2 w-2 rounded-full bg-tally shadow-[0_0_8px_hsl(var(--tally)/0.5)]" />
            </span>
            <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-card-foreground">EN EL AIRE</span>
            <span className={`hidden h-1.5 w-1.5 rounded-full sm:inline ${cfg.dot}`} aria-hidden />
          </span>
          <span className="hidden items-center gap-1 font-mono text-[9px] tracking-[0.08em] text-faint sm:flex" aria-hidden>
            <span>88</span>
            <span className="h-2 w-px bg-border" />
            <span>96</span>
            <span className="h-3 w-px bg-primary" />
            <span>104</span>
            <span>108 FM</span>
          </span>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-muted-foreground">
            <span className="text-[11px]">×</span>
          </span>
        </div>
        {mediaNode}
        <div className="p-4">
          <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[11px] ${cfg.badge}`}>
            {cfg.label} · centrado al entrar
          </span>
          <h4 className="mt-2 font-display text-xl font-bold leading-tight tracking-tight text-card-foreground">
            {title || "Título del aviso"}
          </h4>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {body || "El cuerpo del aviso aparecerá aquí. Usa un mensaje breve y cálido."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ctaLabel ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
                {ctaLabel} <ExternalLink className="h-3 w-3" />
              </span>
            ) : (
              <span className="inline-flex rounded-full border border-border bg-secondary px-4 py-2 text-xs font-medium text-secondary-foreground">
                Continuar escuchando
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border bg-card shadow-sm border-l-4 ${cfg.border}`}>
      <div className={`h-[3px] w-full ${cfg.dot}`} aria-hidden />
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
        <span className={`h-2 w-2 rounded-full ${cfg.dot}`} aria-hidden />
        <span className="font-mono text-[10px] tracking-wide text-muted-foreground">{cfg.label} · discreto</span>
        <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-faint">AVISO</span>
      </div>
      {toastMediaNode}
      <div className="p-4">
        <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[11px] ${cfg.badge}`}>{cfg.label}</span>
        <h4
          className="mt-2 font-[700] leading-tight text-card-foreground"
          style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "18px" }}
        >
          {title || "Título del aviso"}
        </h4>
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {body || "El cuerpo del aviso aparecerá aquí. Usa un mensaje breve y cálido."}
        </p>
        {ctaLabel && (
          <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
            {ctaLabel} <ExternalLink className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}
