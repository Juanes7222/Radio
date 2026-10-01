import { useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useGlobalAudio } from '@/hooks/useGlobalAudio';
import { Play, Pause, Volume2, VolumeX, Radio, ArrowUp } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface MiniPlayerProps {
  /**
   * "bottom" docks the player above the viewport edge (used outside the home
   * page). "top" docks it at the top of the viewport and slides in and out,
   * for the home page where the full console is the primary player.
   */
  variant?: 'bottom' | 'top';
}

/**
 * Slim on-air strip: mono eyebrow with the live state and the artist, serif
 * title, and the signal hairline at the bottom edge — the same vocabulary as
 * the station console, at a fraction of its height.
 */
export function MiniPlayer({ variant = 'bottom' }: MiniPlayerProps) {
  const { data, playerState, togglePlay, toggleMute, setVolume } = useGlobalAudio();
  const shouldReduceMotion = useReducedMotion();
  const isTopDocked = variant === 'top';
  const shouldSlide = isTopDocked && !shouldReduceMotion;

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: shouldReduceMotion ? 'auto' : 'smooth' });
  }, [shouldReduceMotion]);

  if (!data?.now_playing) return null;

  const { song } = data.now_playing;
  const isPlaying = playerState.isPlaying;
  const progress =
    data.now_playing.duration > 0
      ? (data.now_playing.elapsed / data.now_playing.duration) * 100
      : 0;
  const eyebrow = [isPlaying ? 'Al aire' : 'En espera', song.artist]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <motion.div
      initial={shouldSlide ? { y: '-110%', opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      exit={shouldSlide ? { y: '-110%', opacity: 0 } : { opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
      className={`fixed left-0 right-0 z-50 bg-card/60 backdrop-blur-xl border-border/50 will-change-transform ${
        isTopDocked ? 'top-0 border-b' : 'bottom-0 border-t'
      }`}
      role="region"
      aria-label="Reproductor minimizado"
    >
      <div className="mx-auto flex h-14 md:h-16 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
        <div className="relative flex h-9 w-9 md:h-10 md:w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-border/60">
          {song.art ? (
            <img
              src={song.art}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Radio className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={`flex items-center gap-1.5 font-mono text-xs tracking-widest uppercase ${
              isPlaying ? 'text-tally' : 'text-muted-foreground'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isPlaying ? 'bg-tally animate-pulse' : 'bg-muted-foreground/40'
              }`}
              aria-hidden
            />
            <span className="truncate">{eyebrow}</span>
          </p>
          <p
            className="truncate font-display text-[15px] md:text-base leading-tight"
            title={song.title}
          >
            {song.title || 'La Voz de la Verdad'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <div className="hidden md:flex items-center gap-1.5">
            <button
              onClick={toggleMute}
              className="rounded-full p-1.5 text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={playerState.isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {playerState.isMuted || playerState.volume === 0 ? (
                <VolumeX className="h-4 w-4" aria-hidden />
              ) : (
                <Volume2 className="h-4 w-4" aria-hidden />
              )}
            </button>
            <Slider
              value={[playerState.isMuted ? 0 : playerState.volume]}
              onValueChange={([v]) => setVolume(v ?? 0)}
              max={100}
              step={1}
              className="w-20"
              aria-label="Volumen"
            />
          </div>

          {isTopDocked && (
            <button
              onClick={scrollToTop}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Volver arriba"
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
          )}

          <button
            onClick={togglePlay}
            className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[transform,filter] duration-150 ease-out hover:brightness-105 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" aria-hidden />
            ) : (
              <Play className="h-4 w-4 translate-x-px fill-current" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Signal hairline — bottom edge, same device as the console meta bar */}
      <div className="h-[2px] w-full overflow-hidden bg-border/40" aria-hidden>
        <div
          className="h-full origin-left bg-primary transition-transform duration-1000 ease-linear will-change-transform"
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>
    </motion.div>
  );
}
