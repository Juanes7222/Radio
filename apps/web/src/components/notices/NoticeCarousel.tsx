import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Film } from "lucide-react";
import { resolveNoticeMediaSrc, resolveVideoPosterSrc } from "@/lib/noticeMedia";

export interface CarouselItem {
  type: "image" | "video";
  url: string;
  posterUrl: string | null;
}

interface Props {
  items: CarouselItem[];
  autoPlayMs?: number;
}

/**
 * Filmstrip carousel for full-screen notices.
 * Distinctive element: perforated top/bottom rails + tape-deck controls.
 * Auto-advances every 4s, pauses on hover, respects reduced motion.
 * Supports mixed image/video items with poster thumbnails for videos.
 */
export function NoticeCarousel({ items, autoPlayMs = 4000 }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((idx: number) => emblaApi?.scrollTo(idx), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
  }, [emblaApi, onSelect]);

  // Autoplay with pause on hover/focus
  const [isHovered, setIsHovered] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion || isHovered || !emblaApi || items.length <= 1) return;
    const id = window.setInterval(() => emblaApi.scrollNext(), autoPlayMs);
    return () => window.clearInterval(id);
  }, [emblaApi, autoPlayMs, isHovered, prefersReducedMotion, items.length]);

  if (items.length === 0) return null;
  if (items.length === 1) {
    const item = items[0];
    const src = resolveNoticeMediaSrc(item.url);
    const poster = item.posterUrl ? resolveNoticeMediaSrc(item.posterUrl) : resolveVideoPosterSrc(item.url);
    return (
      <div className="relative">
        {item.type === "video" ? (
          <video src={src ?? ""} poster={poster ?? undefined} controls playsInline preload="metadata" className="aspect-[16/9] w-full object-contain bg-black" />
        ) : (
          <img src={src ?? ""} alt="" className="aspect-[16/9] w-full object-cover" loading="eager" />
        )}
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden bg-black"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsHovered(true)}
      onBlurCapture={() => setIsHovered(false)}
    >
      {/* Top perforations — filmstrip vernacular */}
      <div className="flex h-6 items-center gap-1 border-y border-border bg-card px-2" aria-hidden>
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} className="h-2 w-2 rounded-sm bg-border" />
        ))}
        <span className="ml-auto flex items-center gap-1 font-mono text-[9px] tracking-widest text-faint">
          <Film className="h-3 w-3" />
          {items.length} FRAMES · AUTO 4S
        </span>
      </div>

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {items.map((item, idx) => {
            const src = resolveNoticeMediaSrc(item.url);
            const poster = item.posterUrl ? resolveNoticeMediaSrc(item.posterUrl) : resolveVideoPosterSrc(item.url);
            return (
              <div key={`${item.url}-${idx}`} className="min-w-0 flex-[0_0_100%]">
                {item.type === "video" ? (
                  <video
                    src={src ?? ""}
                    poster={poster ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-[16/9] w-full object-contain bg-black"
                  />
                ) : (
                  <img src={src ?? ""} alt="" className="aspect-[16/9] w-full object-cover" loading={idx === 0 ? "eager" : "lazy"} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom perforations */}
      <div className="flex h-6 items-center gap-1 border-y border-border bg-card px-2" aria-hidden>
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} className="h-2 w-2 rounded-sm bg-border" />
        ))}
        <span className="ml-auto font-mono text-[9px] text-faint">CINTA</span>
      </div>

      {/* Tape-deck controls */}
      <button
        type="button"
        onClick={scrollPrev}
        aria-label="Anterior"
        className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        aria-label="Siguiente"
        className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur">
        {items.map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => scrollTo(idx)}
            aria-label={`Ir a ${idx + 1}`}
            aria-current={idx === selectedIndex}
            className={`h-1.5 rounded-full transition-all ${idx === selectedIndex ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"}`}
          />
        ))}
      </div>
    </div>
  );
}
