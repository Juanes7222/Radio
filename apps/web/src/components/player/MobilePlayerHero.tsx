import { motion, AnimatePresence } from 'framer-motion';
import { Music } from 'lucide-react';
import { formatMediaTitle } from '@/lib/formatMedia';
import type { NowPlaying, PlayerState } from '@/types/azuracast';
import LOGO from '@assets/img/LOGO_COMPLETO_SINFONDO2.png';

interface MobilePlayerHeroProps {
  song: NowPlaying | null;
  isLoading: boolean;
  isDark: boolean;
  playerState: PlayerState;
  artworkLoadFailed: boolean;
  onTogglePlay: () => void;
  onArtworkError: (songId: string) => void;
}

export function MobilePlayerHero({
  song,
  isLoading,
  isDark,
  playerState,
  artworkLoadFailed,
  onTogglePlay,
  onArtworkError,
}: MobilePlayerHeroProps) {
  const songData = song?.song ?? null;
  const { title, artist, isPreaching } = formatMediaTitle(
    songData?.title ?? '',
    songData?.artist ?? '',
  );

  return (
    <section
      className={`md:hidden relative overflow-hidden px-5 pt-8 pb-6 ${
        isDark
          ? 'bg-gradient-to-b from-indigo-950/60 to-slate-950'
          : 'bg-gradient-to-b from-indigo-50 to-slate-50'
      }`}
    >
      <img src={LOGO} alt="Logo la voz de la verdad" className="mx-auto mb-6 w-60 h-auto" />

      <div className="absolute inset-0 pointer-events-none">
        <div
          className={`absolute inset-0 ${
            isDark
              ? 'bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18)_0%,_transparent_65%)]'
              : 'bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.10)_0%,_transparent_65%)]'
          }`}
        />
      </div>

      <div className="relative flex flex-col items-center gap-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={songData?.id ?? 'no-song'}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4 }}
            className="relative cursor-pointer select-none"
            onClick={onTogglePlay}
          >
            {songData?.art && !artworkLoadFailed && (
              <div
                className="absolute inset-0 rounded-full blur-2xl scale-110 opacity-40"
                style={{ backgroundImage: `url(${songData.art})`, backgroundSize: 'cover' }}
              />
            )}

            <motion.div
              animate={playerState.isPlaying ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
              className="relative w-44 h-44 rounded-full overflow-hidden shadow-2xl border-4 border-white/10"
            >
              {songData?.art && !artworkLoadFailed ? (
                <img
                  src={songData.art}
                  alt="Caratula"
                  className="w-full h-full object-cover"
                  onError={() => songData.id && onArtworkError(songData.id)}
                />
              ) : (
                <div
                  className={`w-full h-full flex items-center justify-center ${
                    isDark ? 'bg-slate-800' : 'bg-slate-200'
                  }`}
                >
                  <Music className="w-16 h-16 text-indigo-400 opacity-60" />
                </div>
              )}
            </motion.div>

            <motion.div
              className="absolute inset-0 rounded-full flex items-center justify-center"
              animate={{
                backgroundColor: playerState.isPlaying
                  ? 'rgba(0,0,0,0.25)'
                  : 'rgba(0,0,0,0.50)',
              }}
              transition={{ duration: 0.2 }}
            >
              {playerState.isLoading ? (
                <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
              ) : playerState.isPlaying ? (
                <svg
                  className="w-12 h-12 text-white drop-shadow-lg opacity-70"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg
                  className="w-12 h-12 text-white drop-shadow-lg ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={songData?.id ?? 'no-info'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="text-center max-w-xs"
          >
            {isLoading ? (
              <div className="space-y-2 flex flex-col items-center">
                <div
                  className={`h-5 w-48 rounded-full animate-pulse ${
                    isDark ? 'bg-slate-700' : 'bg-slate-300'
                  }`}
                />
                <div
                  className={`h-4 w-32 rounded-full animate-pulse ${
                    isDark ? 'bg-slate-700' : 'bg-slate-300'
                  }`}
                />
              </div>
            ) : (
              <>
                {isPreaching && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 block mb-0.5">
                    Prédica
                  </span>
                )}
                <p
                  className={`font-bold text-lg leading-tight truncate ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {title || 'La Voz de la Verdad'}
                </p>
                {artist && (
                  <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {artist}
                  </p>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
