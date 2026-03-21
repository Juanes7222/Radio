import { AnimatePresence, motion } from 'framer-motion';
import { Facebook } from 'lucide-react';

interface FacebookLiveBannerProps {
  liveUrl: string | null;
}

export function FacebookLiveBanner({ liveUrl }: FacebookLiveBannerProps) {
  return (
    <AnimatePresence>
      {liveUrl && (
        <div className="px-4 md:max-w-2xl md:mx-auto mt-4 mb-1">
          <motion.a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-lg shadow-red-500/30"
          >
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Facebook className="w-5 h-5" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white">
                <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-75" />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm leading-tight">¡Estamos en vivo!</p>
              <p className="text-xs text-white/80 truncate mt-0.5">Toca para ver la transmisión en Facebook</p>
            </div>
            <div className="shrink-0 bg-white/20 rounded-xl px-3 py-1.5 text-xs font-bold tracking-wide">
              VER →
            </div>
          </motion.a>
        </div>
      )}
    </AnimatePresence>
  );
}
