import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Info, CalendarRange, AlertTriangle, Heart } from 'lucide-react';
import { API_BASE_URL } from '@/config';
import { getNoticeState, bumpNoticeView, dismissNotice, shouldShowNotice } from '@/lib/noticeStorage';
import { NoticeIntrusiveModal } from './NoticeIntrusiveModal';

interface Notice {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  variant: string;
  displayMode?: string;
  maxDisplaysPerUser: number;
  dismissible: boolean;
  endsAt: string;
}

const VARIANT_META: Record<string, { accent: string; badge: string; label: string; icon: typeof Info }> = {
  info: { accent: 'bg-info', badge: 'bg-info/12 text-info border-info/25', label: 'Informativo', icon: Info },
  event: { accent: 'bg-primary', badge: 'bg-primary/12 text-primary border-primary/25', label: 'Evento', icon: CalendarRange },
  warning: { accent: 'bg-warning', badge: 'bg-warning/12 text-warning border-warning/25', label: 'Urgente', icon: AlertTriangle },
  prayer: { accent: 'bg-success', badge: 'bg-success/12 text-success border-success/25', label: 'Oración', icon: Heart },
};

function getDeviceId(): string | null {
  try { return localStorage.getItem('radio:deviceId'); } catch { return null; }
}

function hasSeenModalThisSession(id: string): boolean {
  try { return sessionStorage.getItem(`radio:notice:modal:session:${id}`) === '1'; } catch { return false; }
}

function markModalSession(id: string): void {
  try { sessionStorage.setItem(`radio:notice:modal:session:${id}`, '1'); } catch {}
}

export function NoticeOverlay() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [current, setCurrent] = useState<Notice | null>(null);
  const [progress, setProgress] = useState(0);
  const [modalNotice, setModalNotice] = useState<Notice | null>(null);
  const [modalViewCount, setModalViewCount] = useState(0);

  const fetchNotices = useCallback(async () => {
    try {
      const deviceId = getDeviceId();
      const params = new URLSearchParams();
      if (deviceId) params.set('deviceId', deviceId);
      const url = `${API_BASE_URL}/api/notices/active${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { notices: Notice[] };
      const eligible = data.notices.filter((n) => shouldShowNotice(n.id, n.maxDisplaysPerUser, n.dismissible));

      // Intrusivo (modal) tiene prioridad y se muestra al entrar — solo uno por sesión
      const modals = eligible.filter((n) => (n.displayMode ?? 'toast') === 'modal');
      const toasts = eligible.filter((n) => (n.displayMode ?? 'toast') !== 'modal');

      // elige primer modal no visto en esta sesión
      const sessionModal = modals.find((m) => !hasSeenModalThisSession(m.id)) ?? null;
      if (sessionModal && !modalNotice) {
        setModalNotice(sessionModal);
        const s = bumpNoticeView(sessionModal.id);
        setModalViewCount(s.count);
        markModalSession(sessionModal.id);
      }

      // toast queue: excluye modales; si hay modal activo, el toast espera (no se muestra a la vez)
      setNotices(toasts);
      if (toasts.length > 0 && !current && !sessionModal) {
        const next = toasts[0];
        setCurrent(next);
        bumpNoticeView(next.id);
      } else if (toasts.length > 0 && !current && sessionModal) {
        // hay toast pero modal está activo — no montar toast todavía, se montará al cerrar modal
      }
    } catch {}
  }, [current, modalNotice]);

  useEffect(() => { void fetchNotices(); }, [fetchNotices]);

  // progress hasta expiración (cinta que avanza) — solo para toast
  useEffect(() => {
    if (!current) return;
    const end = new Date(current.endsAt).getTime();
    const start = Date.now() - 1000 * 60 * 60 * 24;
    const tick = () => {
      const now = Date.now();
      const total = Math.max(1, end - start);
      const elapsed = Math.min(total, now - start);
      setProgress((elapsed / total) * 100);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [current]);

  const handleDismissToast = () => {
    if (!current) return;
    const remaining = notices.filter((n) => n.id !== current.id && shouldShowNotice(n.id, n.maxDisplaysPerUser, n.dismissible));
    setNotices(remaining);
    if (remaining.length > 0) {
      const next = remaining[0];
      setCurrent(next);
      bumpNoticeView(next.id);
    } else setCurrent(null);
  };

  const handlePermanentDismissToast = () => {
    if (!current) return;
    dismissNotice(current.id);
    const remaining = notices.filter((n) => n.id !== current.id && shouldShowNotice(n.id, n.maxDisplaysPerUser, n.dismissible));
    setNotices(remaining);
    if (remaining.length > 0) {
      const next = remaining[0];
      setCurrent(next);
      bumpNoticeView(next.id);
    } else setCurrent(null);
  };

  const handleDismissModal = () => {
    if (!modalNotice) return;
    setModalNotice(null);
    const remainingToasts = notices.filter((n) => shouldShowNotice(n.id, n.maxDisplaysPerUser, n.dismissible));
    if (remainingToasts.length > 0 && !current) {
      const next = remainingToasts[0];
      setCurrent(next);
      bumpNoticeView(next.id);
    }
  };

  const handlePermanentDismissModal = () => {
    if (!modalNotice) return;
    dismissNotice(modalNotice.id);
    setModalNotice(null);
    const remainingToasts = notices.filter((n) => n.id !== modalNotice.id && shouldShowNotice(n.id, n.maxDisplaysPerUser, n.dismissible));
    // también filtra el modal descartado permanentemente
    setNotices(remainingToasts.filter((n) => n.id !== modalNotice.id));
  };

  const handleCtaToast = () => {
    if (current?.ctaUrl) window.open(current.ctaUrl, '_blank', 'noopener');
  };

  const handleCtaModal = () => {
    if (modalNotice?.ctaUrl) window.open(modalNotice.ctaUrl, '_blank', 'noopener');
  };

  return (
    <>
      <NoticeIntrusiveModal
        notice={modalNotice}
        viewCount={modalViewCount}
        onDismiss={handleDismissModal}
        onPermanentDismiss={handlePermanentDismissModal}
        onCta={handleCtaModal}
      />

      {current && !modalNotice && (() => {
        const meta = VARIANT_META[current.variant] ?? VARIANT_META.info;
        const Icon = meta.icon;
        return (
        <AnimatePresence>
          <motion.div
            key={current.id}
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:justify-end sm:px-4 sm:pb-6"
            aria-live="polite"
          >
            <div className="pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
              {/* accent top */}
              <div className={`h-[3px] w-full ${meta.accent}`} aria-hidden />
              <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
                <span className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none tracking-wide" style={{ background: 'hsl(var(--card))' }}>
                  <span className={`h-1.5 w-1.5 rounded-full ${meta.accent}`} aria-hidden />
                  <span className="font-mono text-[10px] tracking-wide text-muted-foreground">{meta.label}</span>
                </span>
                <span className="flex gap-1" aria-hidden>{Array.from({ length: 4 }).map((_, i) => <span key={i} className="h-1 w-1 rounded-full bg-border" />)}</span>
                <span className="ml-auto font-mono text-[10px] tracking-[0.14em] text-muted-foreground/60">AVISO</span>
              </div>
              {/* progress */}
              <div className="relative h-[2px] bg-border/50" aria-hidden>
                <div className="absolute inset-y-0 left-0 bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(4, progress))}%` }} />
                <div className={`absolute inset-y-0 left-0 w-full ${meta.accent} opacity-40`} />
              </div>

              {current.imageUrl && (
                <div className="relative">
                  <img src={current.imageUrl.startsWith('/media/') ? `${API_BASE_URL}/api${current.imageUrl}` : current.imageUrl} alt="" className="aspect-[16/7] w-full object-cover" loading="lazy" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/40 to-transparent" aria-hidden />
                </div>
              )}

              <div className="relative p-4 pr-10">
                <button
                  onClick={handleDismissToast}
                  aria-label={current.dismissible ? 'Cerrar aviso' : 'Ocultar aviso'}
                  className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </div>
                <h3 className="mt-2 pr-2 text-[17px] font-bold leading-tight tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
                  {current.title}
                </h3>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{current.body}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {current.ctaLabel && current.ctaUrl && (
                    <button
                      onClick={handleCtaToast}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_4px_12px_hsl(var(--primary)/0.25)] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {current.ctaLabel}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={handleDismissToast}
                    className="rounded-full px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Ocultar
                  </button>
                  {current.dismissible && (
                    <button
                      onClick={handlePermanentDismissToast}
                      className="rounded-full px-3 py-2 text-xs font-medium text-faint underline-offset-4 hover:text-foreground hover:underline"
                    >
                      No volver a mostrar
                    </button>
                  )}
                </div>

                {current.maxDisplaysPerUser > 0 && (
                  <p className="mt-2 font-mono text-[11px] text-faint">
                    {getNoticeState(current.id).count}/{current.maxDisplaysPerUser} vistas
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        );
      })()}
    </>
  );
}
