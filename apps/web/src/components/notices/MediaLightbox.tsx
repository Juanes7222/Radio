import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, Maximize2 } from "lucide-react";

interface Props {
  open: boolean;
  src: string | null;
  type: "image" | "video";
  poster?: string | null;
  alt?: string;
  initialTime?: number;
  autoPlay?: boolean;
  onClose: () => void;
  onCloseWithTime?: (currentTime: number, wasPlaying: boolean) => void;
}

export function MediaLightbox({ open, src, type, poster, alt, initialTime, autoPlay, onClose, onCloseWithTime }: Props) {
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => closeRef.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  // seek to initialTime when video metadata ready
  useEffect(() => {
    if (!open || type !== "video" || initialTime == null || !videoRef.current) return;
    const v = videoRef.current;
    const seek = () => {
      try {
        v.currentTime = initialTime;
        if (autoPlay) void v.play().catch(() => {});
      } catch {}
    };
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
  }, [open, type, initialTime, autoPlay]);

  const handleClose = () => {
    if (type === "video" && videoRef.current && onCloseWithTime) {
      const t = videoRef.current.currentTime;
      const wasPlaying = !videoRef.current.paused;
      try { videoRef.current.pause(); } catch {}
      onCloseWithTime(t, wasPlaying);
    }
    onClose();
  };

  if (!src) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.15 : 0.2 }}
          className="fixed inset-0 z-[90] flex flex-col bg-black/90 backdrop-blur-[16px]"
          role="dialog"
          aria-modal="true"
          aria-label="Vista ampliada"
          onClick={handleClose}
        >
          {/* top bar */}
          <div className="flex shrink-0 items-center justify-between px-4 py-3 sm:px-6">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-white/60">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              VISTA COMPLETA
              <span className="hidden sm:inline opacity-40">· ESC para cerrar</span>
            </span>
            <button
              ref={closeRef}
              onClick={handleClose}
              aria-label="Cerrar vista completa"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* media stage — respects natural aspect, never crops */}
          <div
            className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={reduce ? { duration: 0.18 } : { type: "spring", damping: 28, stiffness: 320 }}
              className="relative flex max-h-full max-w-full items-center justify-center"
              onClick={handleClose}
            >
              {type === "video" ? (
                <video
                  ref={videoRef}
                  src={src}
                  poster={poster ?? undefined}
                  controls
                  autoPlay={autoPlay ?? true}
                  playsInline
                  preload="metadata"
                  className="max-h-[78vh] max-w-[92vw] rounded-xl bg-black object-contain shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:max-h-[82vh] sm:max-w-[88vw]"
                />
              ) : (
                <img
                  src={src}
                  alt={alt ?? ""}
                  className="max-h-[78vh] max-w-[92vw] rounded-xl object-contain shadow-[0_24px_80px_rgba(0,0,0,0.6)] sm:max-h-[82vh] sm:max-w-[88vw]"
                  draggable={false}
                />
              )}
            </motion.div>
          </div>

          {/* bottom hint */}
          <div className="shrink-0 pb-6 pt-2 text-center font-mono text-[11px] tracking-wide text-white/40">
            Toca fuera o presiona ESC para cerrar
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
