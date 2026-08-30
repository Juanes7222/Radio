import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Film, Expand, Play } from "lucide-react";
import { resolveNoticeMediaSrc, resolveVideoPosterSrc } from "@/lib/noticeMedia";
import { MediaLightbox } from "./MediaLightbox";

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
 * Adaptive filmstrip carousel.
 * - No forced crop: media uses object-contain and max-h, respects natural dimensions.
 * - Click any frame to open fullscreen lightbox.
 * - Tape-deck rails kept as vernacular but muted; stage is now letterboxed black.
 */
export function NoticeCarousel({ items, autoPlayMs = 4000 }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightbox, setLightbox] = useState<{ src: string; type: "image" | "video"; poster: string | null } | null>(null);
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

  const [isHovered, setIsHovered] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion || isHovered || !emblaApi || items.length <= 1 || lightbox) return;
    const id = window.setInterval(() => emblaApi.scrollNext(), autoPlayMs);
    return () => window.clearInterval(id);
  }, [emblaApi, autoPlayMs, isHovered, prefersReducedMotion, items.length, lightbox]);

  if (items.length === 0) return null;

  // Single — adaptive, no crop, click to expand
  if (items.length === 1) {
    const item = items[0];
    const src = resolveNoticeMediaSrc(item.url);
    const poster = item.posterUrl ? resolveNoticeMediaSrc(item.posterUrl) : resolveVideoPosterSrc(item.url);
    const isVideo = item.type === "video";
    return (
      <>
        <div className="group relative flex max-h-[62vh] min-h-[220px] items-center justify-center overflow-hidden bg-black">
          {isVideo ? (
            <button
              type="button"
              onClick={() => src && setLightbox({ src, type: "video", poster })}
              className="relative flex max-h-[62vh] w-full cursor-zoom-in items-center justify-center focus-visible:outline-none"
              aria-label="Ampliar video"
            >
              <video
                src={src ?? ""}
                poster={poster ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="h-auto max-h-[62vh] w-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
              <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <span className="rounded-full bg-black/60 px-3 py-1.5 font-mono text-[11px] tracking-wide text-white backdrop-blur">Ampliar</span>
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => src && setLightbox({ src, type: "image", poster: null })}
              className="group relative flex max-h-[62vh] w-full cursor-zoom-in items-center justify-center focus-visible:outline-none"
              aria-label="Ampliar imagen"
            >
              <img
                src={src ?? ""}
                alt=""
                className="h-auto max-h-[62vh] w-full object-contain"
                loading="eager"
                draggable={false}
              />
              <span className="pointer-events-none absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Expand className="h-4 w-4" />
              </span>
              {/* subtle scanline */}
              <span className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 2px, white 2px 3px)" }} aria-hidden />
            </button>
          )}
        </div>
        <MediaLightbox
          open={!!lightbox}
          src={lightbox?.src ?? null}
          type={lightbox?.type ?? "image"}
          poster={lightbox?.poster ?? null}
          onClose={() => setLightbox(null)}
        />
      </>
    );
  }

  return (
    <>
      <div
        className="relative overflow-hidden bg-black"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsHovered(true)}
        onBlurCapture={() => setIsHovered(false)}
      >
        {/* Top perforations — muted */}
        <div className="flex h-[22px] items-center gap-1 border-y border-border bg-card px-2" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-sm bg-border" />
          ))}
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] tracking-[0.12em] text-faint">
            <Film className="h-3 w-3 opacity-60" />
            {items.length} FRAMES · AUTO 4S
          </span>
        </div>

        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {items.map((item, idx) => {
              const src = resolveNoticeMediaSrc(item.url);
              const poster = item.posterUrl ? resolveNoticeMediaSrc(item.posterUrl) : resolveVideoPosterSrc(item.url);
              const isVideo = item.type === "video";
              return (
                <div key={`${item.url}-${idx}`} className="min-w-0 flex-[0_0_100%]">
                  <div className="group relative flex max-h-[58vh] min-h-[240px] items-center justify-center bg-black">
                    {isVideo ? (
                      <div className="relative flex w-full items-center justify-center">
                        <video
                          src={src ?? ""}
                          poster={poster ?? undefined}
                          controls
                          playsInline
                          preload="metadata"
                          className="h-auto max-h-[58vh] w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => src && setLightbox({ src, type: "video", poster })}
                          className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                          aria-label="Ampliar video"
                        >
                          <Expand className="h-4 w-4" />
                        </button>
                        <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 font-mono text-[10px] tracking-wide text-white backdrop-blur">
                          <Play className="h-3 w-3" /> VIDEO
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => src && setLightbox({ src, type: "image", poster: null })}
                        className="flex h-full w-full cursor-zoom-in items-center justify-center focus-visible:outline-none"
                        aria-label={`Ampliar imagen ${idx + 1}`}
                      >
                        <img
                          src={src ?? ""}
                          alt=""
                          className="h-auto max-h-[58vh] w-full object-contain"
                          loading={idx === 0 ? "eager" : "lazy"}
                          draggable={false}
                        />
                        <span className="pointer-events-none absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                          <Expand className="h-4 w-4" />
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom rail */}
        <div className="flex h-[22px] items-center gap-1 border-y border-border bg-card px-2" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-sm bg-border" />
          ))}
          <span className="ml-auto font-mono text-[9px] tracking-[0.12em] text-faint">CINTA</span>
        </div>

        {/* controls — inset, not overlapping media controls */}
        <button
          type="button"
          onClick={scrollPrev}
          aria-label="Anterior"
          className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={scrollNext}
          aria-label="Siguiente"
          className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Dots */}
        <div className="absolute bottom-[30px] left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur">
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

      <MediaLightbox
        open={!!lightbox}
        src={lightbox?.src ?? null}
        type={lightbox?.type ?? "image"}
        poster={lightbox?.poster ?? null}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}
