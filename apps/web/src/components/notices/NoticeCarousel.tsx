import { useCallback, useEffect, useRef, useState } from "react";
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
 * - Fixed stage height (centers both portrait & landscape) avoids jump + black-zone distortion.
 * - object-contain, never crop. Horizontal now centered vertically inside same stage.
 * - Video fullscreen handoff: pause inline, seek lightbox to same time, resume on close.
 * - Dots refined to minimal scale.
 */
export function NoticeCarousel({ items, autoPlayMs = 4000 }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightbox, setLightbox] = useState<{
    src: string;
    type: "image" | "video";
    poster: string | null;
    initialTime: number;
    autoPlay: boolean;
    sourceIdx: number;
  } | null>(null);
  const inlineVideoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const singleVideoRef = useRef<HTMLVideoElement>(null);
  const [singleLightbox, setSingleLightbox] = useState<{
    src: string;
    type: "image" | "video";
    poster: string | null;
    initialTime: number;
    autoPlay: boolean;
  } | null>(null);

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
    if (prefersReducedMotion || isHovered || !emblaApi || items.length <= 1 || lightbox || singleLightbox) return;
    const id = window.setInterval(() => emblaApi.scrollNext(), autoPlayMs);
    return () => window.clearInterval(id);
  }, [emblaApi, autoPlayMs, isHovered, prefersReducedMotion, items.length, lightbox, singleLightbox]);

  const openLightboxForIdx = (idx: number) => {
    const item = items[idx];
    const src = resolveNoticeMediaSrc(item.url);
    if (!src) return;
    const poster = item.posterUrl ? resolveNoticeMediaSrc(item.posterUrl) : resolveVideoPosterSrc(item.url);
    if (item.type === "video") {
      const v = inlineVideoRefs.current.get(idx);
      const t = v ? v.currentTime : 0;
      const wasPlaying = v ? !v.paused && !v.ended : false;
      if (v) try { v.pause(); } catch {}
      setLightbox({ src, type: "video", poster, initialTime: t, autoPlay: wasPlaying, sourceIdx: idx });
    } else {
      setLightbox({ src, type: "image", poster: null, initialTime: 0, autoPlay: false, sourceIdx: idx });
    }
  };

  const handleLightboxClose = (currentTime: number, wasPlaying: boolean) => {
    if (!lightbox || lightbox.type !== "video") return;
    const v = inlineVideoRefs.current.get(lightbox.sourceIdx);
    if (v) {
      try {
        v.currentTime = currentTime;
        if (wasPlaying) void v.play().catch(() => {});
      } catch {}
    }
  };

  if (items.length === 0) return null;

  // Single — adaptive, no crop, click to expand, with video handoff
  if (items.length === 1) {
    const item = items[0];
    const src = resolveNoticeMediaSrc(item.url);
    const poster = item.posterUrl ? resolveNoticeMediaSrc(item.posterUrl) : resolveVideoPosterSrc(item.url);
    const isVideo = item.type === "video";

    const openSingle = () => {
      if (!src) return;
      if (isVideo) {
        const v = singleVideoRef.current;
        const t = v ? v.currentTime : 0;
        const wasPlaying = v ? !v.paused && !v.ended : false;
        if (v) try { v.pause(); } catch {}
        setSingleLightbox({ src, type: "video", poster, initialTime: t, autoPlay: wasPlaying });
      } else {
        setSingleLightbox({ src, type: "image", poster: null, initialTime: 0, autoPlay: false });
      }
    };

    const handleSingleClose = (currentTime: number, wasPlaying: boolean) => {
      const v = singleVideoRef.current;
      if (v) {
        try {
          v.currentTime = currentTime;
          if (wasPlaying) void v.play().catch(() => {});
        } catch {}
      }
    };

    return (
      <>
        <div className="group relative flex max-h-[62vh] min-h-[220px] items-center justify-center overflow-hidden bg-black">
          {isVideo ? (
            <div className="relative flex w-full items-center justify-center">
              <video
                ref={singleVideoRef}
                src={src ?? ""}
                poster={poster ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="h-auto max-h-[62vh] w-full object-contain"
              />
              <button
                type="button"
                onClick={openSingle}
                className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label="Ampliar video"
              >
                <Expand className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openSingle}
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
              <span className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 2px, white 2px 3px)" }} aria-hidden />
            </button>
          )}
        </div>
        <MediaLightbox
          open={!!singleLightbox}
          src={singleLightbox?.src ?? null}
          type={singleLightbox?.type ?? "image"}
          poster={singleLightbox?.poster ?? null}
          initialTime={singleLightbox?.initialTime}
          autoPlay={singleLightbox?.autoPlay}
          onClose={() => setSingleLightbox(null)}
          onCloseWithTime={(t, wasPlaying) => handleSingleClose(t, wasPlaying)}
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

        {/* Viewport — fixed stage height so mixed orientations share same centered stage */}
        <div className="h-[340px] overflow-hidden sm:h-[420px] max-h-[56vh]" ref={emblaRef}>
          <div className="flex h-full">
            {items.map((item, idx) => {
              const src = resolveNoticeMediaSrc(item.url);
              const poster = item.posterUrl ? resolveNoticeMediaSrc(item.posterUrl) : resolveVideoPosterSrc(item.url);
              const isVideo = item.type === "video";
              return (
                <div key={`${item.url}-${idx}`} className="flex min-w-0 flex-[0_0_100%] items-center justify-center bg-black">
                  <div className="flex h-full w-full items-center justify-center p-0">
                    {isVideo ? (
                      <div className="relative flex h-full w-full items-center justify-center">
                        <video
                          ref={(el) => {
                            if (el) inlineVideoRefs.current.set(idx, el);
                            else inlineVideoRefs.current.delete(idx);
                          }}
                          src={src ?? ""}
                          poster={poster ?? undefined}
                          controls
                          playsInline
                          preload="metadata"
                          className="h-full max-h-full w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => openLightboxForIdx(idx)}
                          className="absolute bottom-3 right-3 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                          aria-label="Ampliar video"
                        >
                          <Expand className="h-3.5 w-3.5" />
                        </button>
                        <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 font-mono text-[10px] tracking-wide text-white backdrop-blur">
                          <Play className="h-3 w-3" /> VIDEO
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openLightboxForIdx(idx)}
                        className="flex h-full w-full cursor-zoom-in items-center justify-center p-2 focus-visible:outline-none"
                        aria-label={`Ampliar imagen ${idx + 1}`}
                      >
                        <img
                          src={src ?? ""}
                          alt=""
                          className="h-full max-h-full w-auto max-w-full object-contain"
                          loading={idx === 0 ? "eager" : "lazy"}
                          draggable={false}
                        />
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

        {/* controls */}
        <button
          type="button"
          onClick={scrollPrev}
          aria-label="Anterior"
          className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={scrollNext}
          aria-label="Siguiente"
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Dots — refined small scale */}
        <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur">
          {items.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => scrollTo(idx)}
              aria-label={`Ir a ${idx + 1}`}
              aria-current={idx === selectedIndex}
              className={`h-1 rounded-full transition-all ${idx === selectedIndex ? "w-4 bg-white" : "w-1 bg-white/40 hover:bg-white/60"}`}
            />
          ))}
        </div>
      </div>

      <MediaLightbox
        open={!!lightbox}
        src={lightbox?.src ?? null}
        type={lightbox?.type ?? "image"}
        poster={lightbox?.poster ?? null}
        initialTime={lightbox?.initialTime}
        autoPlay={lightbox?.autoPlay}
        onClose={() => setLightbox(null)}
        onCloseWithTime={(t, wasPlaying) => handleLightboxClose(t, wasPlaying)}
      />
    </>
  );
}
