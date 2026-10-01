import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router';
import { Facebook, Radio, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FacebookLivePlayerProps {
  liveUrl: string | null;
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

  return (
    <div className="w-full px-4 py-6">
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
                key="player"
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.97 }}
                transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                className="w-full will-change-transform"
              >
                {/* Live Badge — coherente con el lenguaje mono/eyebrow del sitio */}
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

                {/* Facebook Live Player Iframe */}
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
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
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
    </div>
  );
}
