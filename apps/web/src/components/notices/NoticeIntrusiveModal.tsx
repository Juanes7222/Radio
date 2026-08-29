import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';

interface Notice {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  variant: string;
  maxDisplaysPerUser: number;
  dismissible: boolean;
  endsAt: string;
}

const VARIANT_LABEL: Record<string, string> = {
  info: 'Informativo',
  event: 'Evento',
  warning: 'Urgente',
  prayer: 'Oración',
};

interface Props {
  notice: Notice | null;
  viewCount: number;
  onDismiss: () => void;
  onCta?: () => void;
}

export function NoticeIntrusiveModal({ notice, viewCount, onDismiss, onCta }: Props) {
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
    // focus close button for a11y
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

  const label = VARIANT_LABEL[notice.variant] ?? VARIANT_LABEL.info;

  return (
    <AnimatePresence>
      <motion.div
        key={notice.id}
        ref={overlayRef}
        onClick={handleOverlayClick}
        initial={shouldReduce ? { opacity: 0 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: shouldReduce ? 0.15 : 0.22 }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0F1113]/70 p-4 backdrop-blur-[8px] sm:p-6"
        aria-modal="true"
        role="dialog"
        aria-labelledby="notice-modal-title"
        aria-describedby="notice-modal-body"
      >
        <motion.div
          initial={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
          animate={shouldReduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={shouldReduce ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}
          transition={
            shouldReduce
              ? { duration: 0.18 }
              : { type: 'spring', damping: 28, stiffness: 320, mass: 0.7 }
          }
          className="relative w-full max-w-[560px] overflow-hidden rounded-[20px] border border-[#E8DDD0] bg-[#F5EFE6] shadow-[0_20px_60px_rgba(0,0,0,0.45),0_2px_12px_rgba(0,0,0,0.2)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Console header — the signature */}
          <div className="relative flex items-center justify-between gap-3 bg-[#0F1113] px-4 py-3 text-white">
            {/* tally */}
            <span className="flex items-center gap-2.5">
              <span
                className="relative grid h-2.5 w-2.5 place-items-center"
                aria-hidden
              >
                <span className="absolute inset-0 animate-ping rounded-full bg-[#DC2626]/40" style={{ animationDuration: '1.6s' }} />
                <span className="relative h-2.5 w-2.5 rounded-full bg-[#DC2626] shadow-[0_0_10px_rgba(220,38,38,0.9)]" />
              </span>
              <span className="font-mono text-[11px] font-semibold tracking-[0.14em]">EN EL AIRE</span>
              <span className="hidden font-mono text-[10px] tracking-[0.12em] text-white/45 sm:inline">· AVISO</span>
            </span>

            {/* FM dial — skeuomorphic risk */}
            <span className="hidden items-center gap-[5px] font-mono text-[9px] tracking-[0.08em] text-white/35 sm:flex" aria-hidden>
              <span>88</span>
              <span className="h-2 w-px bg-white/15" />
              <span>92</span>
              <span className="h-2 w-px bg-white/15" />
              <span>96</span>
              <span className="relative mx-0.5 flex flex-col items-center">
                <span className="h-3 w-px bg-amber-400" />
                <span className="mt-0.5 h-1 w-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,146,60,0.9)]" />
              </span>
              <span>104</span>
              <span className="h-2 w-px bg-white/15" />
              <span>108 FM</span>
            </span>

            <button
              ref={closeBtnRef}
              onClick={onDismiss}
              aria-label="Cerrar aviso"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 backdrop-blur transition-colors hover:bg-white/16 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F1113]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* perforated tape */}
          <div className="flex items-center gap-1.5 border-b border-[#E8DDD0] bg-[#EDE6DA] px-4 py-2">
            <span className="flex gap-1" aria-hidden>
              {Array.from({ length: 10 }).map((_, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#1A1C1E]/15" />
              ))}
            </span>
            <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-[#1A1C1E]/50">CINTA · {label.toUpperCase()}</span>
          </div>

          {notice.imageUrl && (
            <img
              src={notice.imageUrl}
              alt=""
              className="aspect-[16/8] w-full object-cover"
              loading="eager"
            />
          )}

          <div className="p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#1A1C1E]/45">
              {label} · {new Date(notice.endsAt).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
            </p>
            <h2
              id="notice-modal-title"
              className="mt-2 text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[#1A1C1E] sm:text-[26px]"
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {notice.title}
            </h2>
            <p
              id="notice-modal-body"
              className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[#1A1C1E]/70"
            >
              {notice.body}
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <button
                onClick={onDismiss}
                className="inline-flex w-full items-center justify-center rounded-full border border-[#1A1C1E]/10 bg-white px-5 py-3 text-sm font-medium text-[#1A1C1E]/70 transition-colors hover:bg-[#1A1C1E]/5 hover:text-[#1A1C1E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:w-auto"
              >
                Continuar escuchando
              </button>
              {notice.ctaLabel && notice.ctaUrl && (
                <button
                  onClick={() => {
                    if (onCta) onCta();
                    else if (notice.ctaUrl) window.open(notice.ctaUrl, '_blank', 'noopener');
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#1A1C1E] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 sm:w-auto"
                >
                  {notice.ctaLabel}
                  <ExternalLink className="h-4 w-4 shrink-0" />
                </button>
              )}
            </div>

            {notice.maxDisplaysPerUser > 0 && (
              <p className="mt-4 text-center font-mono text-[11px] text-[#1A1C1E]/35 sm:text-left">
                {viewCount}/{notice.maxDisplaysPerUser} vistas · se muestra al entrar hasta agotar el límite
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
