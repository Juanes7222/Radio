import { motion, AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';
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

const EQUALIZER_BAR_SCALES = [0.45, 0.8, 1.0, 0.65, 0.9, 0.5, 0.75, 0.6, 0.85];

function EqualizerBars({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 20 }}>
      {EQUALIZER_BAR_SCALES.map((peak, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-indigo-400"
          style={{ height: 20, originY: 1 }}
          animate={
            isPlaying
              ? { scaleY: [0.15, peak, 0.2, peak * 0.75, peak], opacity: [0.5, 1, 0.65, 1, 0.8] }
              : { scaleY: 0.12, opacity: 0.25 }
          }
          transition={
            isPlaying
              ? { duration: 0.75 + i * 0.08, repeat: Infinity, ease: 'easeInOut', delay: i * 0.06 }
              : { duration: 0.4 }
          }
        />
      ))}
    </div>
  );
}

function ArtworkSpinner() {
  return (
    <div className="w-10 h-10 rounded-full border-[3px] border-indigo-600/30 border-t-indigo-600 animate-spin" />
  );
}

function PlayIcon() {
  return (
    <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/50">
      <svg className="w-6 h-6 text-slate-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}

function PauseIcon() {
  return (
    <svg className="w-10 h-10 text-white/70" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="4" width="4" height="16" rx="1.5" />
      <rect x="14" y="4" width="4" height="16" rx="1.5" />
    </svg>
  );
}

export function MobilePlayerHero({
  song,
  isLoading,
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

  const artworkUrl = songData?.art && !artworkLoadFailed ? songData.art : null;
  const displayArtist = artist || null;

  return (
    <section className="md:hidden relative overflow-hidden min-h-[420px]">
      {/* Background layer: blurred artwork or fallback gradient */}
      <div className="absolute inset-0">
        <AnimatePresence>
          {artworkUrl && (
            <motion.div
              key={artworkUrl}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="absolute inset-0 scale-125 blur-3xl"
              style={{ backgroundImage: `url(${artworkUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
          )}
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/70 to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_10%,rgba(69, 63, 237, 0.08),transparent)]" />
      </div>

      <div className="relative flex flex-col items-center px-6 pt-8 pb-8 gap-6">
        {/* Station logo */}
        <motion.img
          src={LOGO}
          alt="La Voz de la Verdad"
          className="w-44 h-auto opacity-90"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 0.9, y: 0 }}
          transition={{ duration: 0.5 }}
        />

        {/* Vinyl artwork */}
        <AnimatePresence mode="wait">
          <motion.button
            key={songData?.id ?? 'no-song'}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            onClick={onTogglePlay}
            className="relative focus:outline-none"
            aria-label={playerState.isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {/* Ambient glow from artwork */}
            {artworkUrl && (
              <div
                className="absolute -inset-4 rounded-full blur-2xl opacity-40 pointer-events-none"
                style={{ backgroundImage: `url(${artworkUrl})`, backgroundSize: 'cover' }}
              />
            )}

            {/* Outer decorative ring */}
            <div className="absolute -inset-2 rounded-full border border-indigo-400/20" />
            <div className="absolute -inset-4 rounded-full border border-indigo-400/10" />

            {/* Rotating disc */}
            <motion.div
              animate={playerState.isPlaying ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
              className="relative w-52 h-52 rounded-full overflow-hidden shadow-2xl ring-1 ring-white/10"
            >
              {artworkUrl ? (
                <img
                  src={artworkUrl}
                  alt="Caratula"
                  className="w-full h-full object-cover"
                  onError={() => songData?.id && onArtworkError(songData.id)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <Radio className="w-16 h-16 text-indigo-400/50" />
                </div>
              )}

              {/* Vinyl grooves overlay */}
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,transparent_28%,rgba(0,0,0,0.25)_29%,transparent_31%,rgba(0,0,0,0.15)_44%,transparent_46%,rgba(0,0,0,0.15)_58%,transparent_60%,rgba(0,0,0,0.1)_73%,transparent_75%)]" />

              {/* Center spindle */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-7 h-7 rounded-full bg-slate-950 border border-indigo-400/30 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-indigo-400/50" />
                </div>
              </div>
            </motion.div>

            {/* Tap overlay: play/pause/loading */}
            <motion.div
              className="absolute inset-0 rounded-full flex items-center justify-center"
              animate={{ backgroundColor: playerState.isPlaying ? 'rgba(0,0,0,0)' : 'rgba(2,6,23,0.55)' }}
              transition={{ duration: 0.25 }}
            >
              {playerState.isLoading ? (
                <ArtworkSpinner />
              ) : playerState.isPlaying ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  whileTap={{ opacity: 1 }}
                  className="w-full h-full flex items-center justify-center"
                >
                  <PauseIcon />
                </motion.div>
              ) : (
                <PlayIcon />
              )}
            </motion.div>
          </motion.button>
        </AnimatePresence>

        {/* Metadata block */}
        <AnimatePresence mode="wait">
          <motion.div
            key={songData?.id ?? 'no-info'}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
            className="flex flex-col items-center gap-2.5 w-full max-w-xs"
          >
            {isLoading ? (
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="h-5 w-52 rounded-full animate-pulse bg-slate-700/70" />
                <div className="h-4 w-32 rounded-full animate-pulse bg-slate-700/50" />
              </div>
            ) : (
              <>
                {/* Status badge */}
                {isPreaching ? (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 border border-indigo-400/35 rounded-full px-3 py-0.5">
                    Prédica
                  </span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80">
                      En Vivo
                    </span>
                  </div>
                )}

                {/* Song title */}
                <p className="text-white font-bold text-xl leading-snug text-center line-clamp-2">
                  {title || 'La Voz de la Verdad'}
                </p>

                {/* Artist — shown when available, with fallback label */}
                <p className="text-indigo-400 text-sm font-medium text-center line-clamp-1 min-h-[20px]">
                  {displayArtist}
                </p>

                {/* Equalizer animation */}
                <div className="pt-1">
                  <EqualizerBars isPlaying={playerState.isPlaying && !playerState.isLoading} />
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}