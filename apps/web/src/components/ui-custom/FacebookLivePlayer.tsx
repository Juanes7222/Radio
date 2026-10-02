import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router';
import { Facebook, Radio, CalendarClock, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollReveal } from '@/components/layout/ScrollReveal';
import { cn } from '@/lib/utils';

interface FacebookLivePlayerProps {
  liveUrl: string | null;
}

/**
 * A broadcast tally lamp: a lit lens in a dark housing, spilling light onto the
 * wall behind it. It is the signal itself — "we are transmitting" — rather than
 * a play button, which is why it replaces the on-air badge in the poster state.
 */
function OnAirLamp({ className }: { className?: string }) {
  return (
    <div className={cn('relative flex h-16 w-16 items-center justify-center md:h-20 md:w-20', className)} aria-hidden>
      <div className="pointer-events-none absolute -inset-x-20 -inset-y-16 rounded-full bg-[radial-gradient(closest-side,hsl(var(--tally)/0.4),transparent)] blur-2xl motion-safe:animate-pulse" />
      <div className="absolute inset-0 rounded-full border border-white/10 bg-black/70 shadow-[inset_0_2px_3px_rgba(0,0,0,0.95)]" />
      <div className="absolute inset-[7px] rounded-full bg-[radial-gradient(circle_at_36%_32%,hsl(var(--tally)),hsl(var(--tally)/0.62)_44%,hsl(var(--tally)/0.14)_100%)]" />
      <div className="absolute left-[27%] top-[23%] h-2 w-3.5 rounded-full bg-white/45 blur-[1px]" />
    </div>
  );
}

export function FacebookLivePlayer({ liveUrl }: FacebookLivePlayerProps) {
  // Construct the Facebook embed URL
  const getEmbedUrl = (url: string | null): string | null => {
    if (!url) return null;
    try {
      const videoId = new URL(url).searchParams.get('v');
      const embedBase = videoId
        ? `https://www.facebook.com/video/video.php?v=${videoId}`
        : url;
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(embedBase)}&show_text=false&width=1920`;
    } catch (error) {
      console.error('Error encoding Facebook URL:', error);
      return null;
    }
  };

  const embedUrl = getEmbedUrl(liveUrl);

  // The embed is a third-party document that sets cookies on facebook.com, so it
  // is only mounted after a deliberate click. Nothing is persisted: a returning
  // visitor always gets the poster again. Deriving `activated` from the URL that
  // was activated — instead of resetting it in an effect — means a new broadcast
  // automatically falls back to the poster.
  const [activatedUrl, setActivatedUrl] = useState<string | null>(null);
  const activated = liveUrl !== null && activatedUrl === liveUrl;

  return (
    <ScrollReveal className="w-full px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Container with responsive grid layout */}
        <div className="relative">
          {/* Placeholder when no live stream */}
          <AnimatePresence mode="wait">
            {!embedUrl ? (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className="w-full rounded-2xl border border-dashed border-border/50 bg-card/30 backdrop-blur-sm p-8 md:p-12"
              >
                <div className="flex flex-col items-center justify-center text-center space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                      <Radio className="w-8 h-8 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg md:text-xl font-semibold text-foreground">
                      La transmisión en vivo no está activa
                    </h3>
                    <p className="text-sm md:text-base text-muted-foreground max-w-md">
                      Cuando transmitamos por Facebook, el video aparecerá aquí. Mientras tanto, la emisora sigue al aire 24/7.
                    </p>
                  </div>
                  <Button asChild variant="outline" className="rounded-full border-border bg-card">
                    <Link to="/programacion">
                      <CalendarClock className="w-4 h-4" aria-hidden />
                      Ver programación
                    </Link>
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="live"
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.97 }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                className="w-full will-change-transform"
              >
                {activated ? (
                  <>
                    {/* Live Badge — coerces con el lenguaje mono/eyebrow del sitio */}
                    <div className="flex items-center justify-center mb-4">
                      <div className="inline-flex items-center gap-2 text-tally">
                        <span className="relative flex h-2 w-2" aria-hidden>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tally opacity-60"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-tally"></span>
                        </span>
                        <span className="font-mono text-sm font-bold tracking-widest uppercase">
                          En vivo · Facebook
                        </span>
                        <Facebook className="w-4 h-4" aria-hidden />
                      </div>
                    </div>

                    <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-black">
                      {/* 16:9 Aspect Ratio Container */}
                      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                        <iframe
                          src={embedUrl}
                          className="absolute top-0 left-0 w-full h-full border-0"
                          style={{ border: 'none', overflow: 'hidden' }}
                          scrolling="no"
                          frameBorder="0"
                          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                          allowFullScreen={true}
                          title="Facebook Live Stream"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Poster — the lamp is the announcement; nothing loads from Facebook yet */}
                    <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-black">
                      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[radial-gradient(72%_68%_at_50%_38%,hsl(var(--tally)/0.11),transparent_74%)] px-6 text-center md:gap-7">
                          <OnAirLamp />
                          <p className="font-display text-3xl leading-tight text-foreground md:text-5xl">
                            Estás en vivo
                          </p>
                          <Button
                            type="button"
                            size="lg"
                            onClick={() => setActivatedUrl(liveUrl)}
                            className="rounded-full"
                          >
                            <Play className="w-4 h-4" aria-hidden />
                            Ver el video en Facebook
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Optional: Link to open in Facebook */}
                {liveUrl && (
                  <div className="mt-4 text-center">
                    <a
                      href={liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground active:scale-[0.97] transition-[transform,color] duration-150 ease-out"
                    >
                      <span className="underline underline-offset-4 decoration-border hover:decoration-current">Abrir en Facebook</span>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ScrollReveal>
  );
}
