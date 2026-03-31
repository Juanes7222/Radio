import { AnimatePresence, motion } from 'framer-motion';
import { Facebook, Radio } from 'lucide-react';

interface FacebookLivePlayerProps {
  liveUrl: string | null;
}

export function FacebookLivePlayer({ liveUrl }: FacebookLivePlayerProps) {
  // Construct the Facebook embed URL
  const getEmbedUrl = (url: string | null): string | null => {
    if (!url) return null;
    try {
      const encodedUrl = encodeURIComponent(url);
      return `https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&appId`;
    } catch (error) {
      console.error('Error encoding Facebook URL:', error);
      return null;
    }
  };

  const embedUrl = getEmbedUrl(liveUrl);

  return (
    <div className="w-full px-4 py-6">
      <div className="max-w-7xl mx-auto">
        {/* Container with responsive grid layout */}
        <div className="relative">
          {/* Placeholder when no live stream */}
          <AnimatePresence mode="wait">
            {!embedUrl ? (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full rounded-2xl border-2 border-dashed border-gray-700/50 bg-slate-900/50 backdrop-blur-sm p-8 md:p-12"
              >
                <div className="flex flex-col items-center justify-center text-center space-y-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                      <Radio className="w-8 h-8 text-gray-500" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg md:text-xl font-semibold text-gray-300">
                      No hay transmisión en vivo en este momento
                    </h3>
                    <p className="text-sm md:text-base text-gray-500 max-w-md">
                      Cuando iniciemos una transmisión en vivo en Facebook, aparecerá aquí automáticamente.
                    </p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="player"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="w-full"
              >
                {/* Live Badge */}
                <div className="flex items-center justify-center mb-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-red-600 to-rose-500 shadow-lg shadow-red-500/30">
                    <div className="relative flex items-center justify-center">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                      </span>
                    </div>
                    <span className="text-white font-bold text-sm md:text-base tracking-wide">
                      EN VIVO
                    </span>
                    <Facebook className="w-4 h-4 md:w-5 md:h-5 text-white" />
                  </div>
                </div>

                {/* Facebook Live Player Iframe */}
                <div className="relative w-full rounded-2xl overflow-hidden shadow-2xl bg-black">
                  {/* 16:9 Aspect Ratio Container */}
                  <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                    <iframe
                      src={embedUrl}
                      className="absolute top-0 left-0 w-full h-full border-0"
                      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                      allowFullScreen
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
                      className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <span>Abrir en Facebook</span>
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
