import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, ExternalLink, Info, CalendarRange, AlertTriangle, Heart } from "lucide-react";
import { resolveNoticeMediaSrc, resolveVideoPosterSrc } from "@/lib/noticeMedia";

interface Notice {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  videoUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  variant: string;
  maxDisplaysPerUser: number;
  dismissible: boolean;
  endsAt: string;
}

const VARIANT_META: Record<string, { label: string; icon: typeof Info; accent: string; badge: string }> = {
  info:    { label: 'Informativo', icon: Info,          accent: 'bg-info',    badge: 'bg-info/12 text-info border-info/25' },
  event:   { label: 'Evento',      icon: CalendarRange, accent: 'bg-primary', badge: 'bg-primary/12 text-primary border-primary/25' },
  warning: { label: 'Urgente',     icon: AlertTriangle, accent: 'bg-warning', badge: 'bg-warning/12 text-warning border-warning/25' },
  prayer:  { label: 'Oración',     icon: Heart,         accent: 'bg-success', badge: 'bg-success/12 text-success border-success/25' },
};

interface Props {
  notice: Notice | null;
  viewCount: number;
  onDismiss: () => void;
  onPermanentDismiss?: () => void;
  onCta?: () => void;
}

export function NoticeIntrusiveModal({ notice, viewCount, onDismiss, onPermanentDismiss, onCta }: Props) {
  const shouldReduce = useReducedMotion();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onDismiss();
    },
    [onDismiss],
  );

  useEffect(() => {
    if (!notice) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 100);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [notice, onDismiss]);

  if (!notice) return null;

  const meta = VARIANT_META[notice.variant] ?? VARIANT_META.info;
  const Icon = meta.icon;
  const videoSrc = resolveNoticeMediaSrc(notice.videoUrl);
  const posterSrc = resolveVideoPosterSrc(notice.videoUrl);
  const imageSrc = resolveNoticeMediaSrc(notice.imageUrl);

  return (
    <AnimatePresence>
      <motion.div
        key={notice.id}
        ref={overlayRef}
        onClick={handleOverlayClick}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduce ? 0.15 : 0.2 }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[10px] sm:p-6"
        aria-modal="true"
        role="dialog"
        aria-labelledby="notice-modal-title"
        aria-describedby="notice-modal-body"
      >
        <motion.div
          initial={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 10 }}
          animate={shouldReduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
          transition={
            shouldReduce
              ? { duration: 0.18 }
              : { type: 'spring', damping: 30, stiffness: 340, mass: 0.65 }
          }
          className="relative flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_64px_rgba(0,0,0,0.55),0_2px_16px_rgba(0,0,0,0.3)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* accent top */}
          <div className={`h-[3px] w-full shrink-0 ${meta.accent}`} aria-hidden />

          {/* header — tally + dial + close — now in-card palette */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
            <span className="flex items-center gap-2.5">
              <span className="relative grid h-2.5 w-2.5 place-items-center" aria-hidden>
                <span className="absolute inset-0 animate-ping rounded-full bg-tally/40" style={{ animationDuration: '1.6s' }} />
                <span className="relative h-2.5 w-2.5 rounded-full bg-tally shadow-[0_0_10px_hsl(var(--tally)/0.6)]" />
              </span>
              <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-foreground">EN EL AIRE</span>
              <span className="hidden font-mono text-[10px] tracking-[0.12em] text-muted-foreground sm:inline">· AVISO</span>
            </span>

            {/* FM dial — vernacular, now muted */}
            <span className="hidden items-center gap-[5px] font-mono text-[9px] tracking-[0.08em] text-muted-foreground/60 sm:flex" aria-hidden>
              <span>88</span>
              <span className="h-2 w-px bg-border" />
              <span>96</span>
              <span className="relative mx-0.5 flex flex-col items-center">
                <span className="h-3 w-px bg-primary" />
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
              </span>
              <span>104</span>
              <span className="h-2 w-px bg-border" />
              <span>108 FM</span>
            </span>

            <button
              ref={closeBtnRef}
              onClick={onDismiss}
              aria-label="Cerrar aviso"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {videoSrc ? (
              <div className="relative">
                <video src={videoSrc} poster={posterSrc ?? undefined} controls playsInline preload="metadata" className="aspect-[16/9] w-full object-contain bg-black" />
              </div>
            ) : imageSrc ? (
              <div className="relative">
                <img src={imageSrc} alt="" className="aspect-[16/9] w-full object-cover" loading="eager" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/30 to-transparent" aria-hidden />
              </div>
            ) : null}

            <div className="p-5 sm:p-6">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide ${meta.badge}`}>
                <Icon className="h-3 w-3" />
                {meta.label}
                <span className="opacity-60">·</span>
                <span className="opacity-80">
                  {new Date(notice.endsAt).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                </span>
              </span>

              <h2
                id="notice-modal-title"
                className="mt-3 text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] text-card-foreground sm:text-[26px]"
                style={{ fontFamily: "'Fraunces', Georgia, serif" }}
              >
                {notice.title}
              </h2>
              <p id="notice-modal-body" className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-muted-foreground">
                {notice.body}
              </p>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                <button
                  onClick={onDismiss}
                  className="inline-flex w-full items-center justify-center rounded-full border border-border bg-secondary px-5 py-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
                >
                  Continuar escuchando
                </button>
                {notice.ctaLabel && notice.ctaUrl && (
                  <button
                    onClick={() => {
                      if (onCta) onCta();
                      else if (notice.ctaUrl) window.open(notice.ctaUrl, '_blank', 'noopener');
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_4px_16px_hsl(var(--primary)/0.25)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
                  >
                    {notice.ctaLabel}
                    <ExternalLink className="h-4 w-4 shrink-0" />
                  </button>
                )}
              </div>
              {notice.dismissible && onPermanentDismiss && (
                <button
                  onClick={onPermanentDismiss}
                  className="mt-3 w-full text-center font-mono text-[11px] text-faint underline-offset-4 hover:text-foreground hover:underline sm:text-left"
                >
                  No volver a mostrar
                </button>
              )}

              {notice.maxDisplaysPerUser > 0 && (
                <p className="mt-4 text-center font-mono text-[11px] text-faint sm:text-left">
                  {viewCount}/{notice.maxDisplaysPerUser} vistas · se muestra al entrar hasta agotar el límite
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
