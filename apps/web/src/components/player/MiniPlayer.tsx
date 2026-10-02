import { useCallback, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useGlobalAudio } from '@/hooks/useGlobalAudio';
import { ArrowUp, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { VinylDisc } from '@/components/ui-custom/VinylDisc';
import { formatMediaTitle } from '@/lib/formatMedia';
import { formatTime } from '@/lib/utils';

/** Matches the console disc rate so the two read as one instrument. */
const DISC_ROTATION_SECONDS = 22;

interface MiniPlayerProps {
  /**
   * "bottom" docks the player above the viewport edge (used outside the home
   * page). "top" docks it at the top of the viewport and slides in and out,
   * for the home page where the full console is the primary player.
   */
  variant?: 'bottom' | 'top';
}

interface MiniDiscProps {
  art: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  reduceMotion: boolean;
  onArtError: () => void;
}

/**
 * The station's signature object at transport size: the same grooved disc as
 * the console, spinning only while audio is actually flowing. A square
 * thumbnail would drop the one object the whole brand is built on.
 */
function MiniDisc({ art, isPlaying, isLoading, reduceMotion, onArtError }: MiniDiscProps) {
  const animate = reduceMotion
    ? { rotate: 0 }
    : isPlaying || isLoading
      ? { rotate: 360 }
      : { rotate: 0 };

  const transition = reduceMotion
    ? { duration: 0 }
    : isPlaying
      ? { duration: DISC_ROTATION_SECONDS, repeat: Infinity, ease: 'linear' as const }
      : isLoading
        ? { duration: 5, repeat: Infinity, ease: 'linear' as const }
        : { duration: 0.7, ease: 'easeOut' as const };

  return (
    <div className="relative h-10 w-10 shrink-0 md:h-11 md:w-11">
      {art && (
        <div
          className="absolute -inset-1 rounded-full opacity-40 blur-md saturate-150"
          style={{ backgroundImage: `url(${art})`, backgroundSize: 'cover' }}
          aria-hidden
        />
      )}

      <motion.div
        animate={animate}
        transition={transition}
        className="relative h-full w-full overflow-hidden rounded-full shadow-console ring-1 ring-white/10 will-change-transform"
      >
        {art ? (
          <img
            src={art}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={onArtError}
          />
        ) : (
          <VinylDisc />
        )}
        <div className="vinyl-groove-overlay absolute inset-0 rounded-full" aria-hidden />
      </motion.div>

      <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
        <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/10 bg-background/90">
          <div className="h-1 w-1 rounded-full bg-primary/70" />
        </div>
      </div>
    </div>
  );
}

/**
 * Slim on-air strip: the console's vocabulary at a fraction of its height —
 * disc, mono state eyebrow, serif title, and the signal hairline on the edge
 * that faces the content the bar floats over.
 */
export function MiniPlayer({ variant = 'bottom' }: MiniPlayerProps) {
  const { data, playerState, togglePlay, toggleMute, setVolume } = useGlobalAudio();
  const reduceMotion = useReducedMotion() ?? false;
  const isTopDocked = variant === 'top';
  const shouldSlide = isTopDocked && !reduceMotion;
  const [failedArtSongId, setFailedArtSongId] = useState<string | null>(null);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [reduceMotion]);

  if (!data?.now_playing) return null;

  const { song, elapsed, duration } = data.now_playing;
  const isPlaying = playerState.isPlaying;
  const hasProgress = duration > 0;
  const progressPct = hasProgress ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0;
  const isMuted = playerState.isMuted || playerState.volume === 0;
  const art = song.art && failedArtSongId !== song.id ? song.art : null;
  const { title, artist } = formatMediaTitle(song.title, song.artist);

  const signalHairline = (
    <div
      className="h-[2px] w-full overflow-hidden bg-border/40"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progressPct)}
      aria-label="Progreso de la canción"
    >
      <div
        className="h-full origin-left bg-gradient-to-r from-primary/25 to-primary transition-transform duration-1000 ease-linear will-change-transform"
        style={{ transform: `scaleX(${progressPct / 100})` }}
      />
    </div>
  );

  return (
    <motion.div
      initial={shouldSlide ? { y: '-110%', opacity: 0 } : false}
      animate={{ y: 0, opacity: 1 }}
      exit={shouldSlide ? { y: '-110%', opacity: 0 } : { opacity: 0 }}
      transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
      className={`fixed left-0 right-0 z-50 border-border/50 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 will-change-transform ${
        isTopDocked ? 'top-0 border-b' : 'bottom-0 border-t pb-safe'
      }`}
      role="region"
      aria-label="Reproductor minimizado"
    >
      {/* Signal hairline on the inner edge, so it always marks the boundary
          between the bar and the content underneath it. */}
      {!isTopDocked && signalHairline}

      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 md:gap-3 md:px-6">
        <MiniDisc
          art={art}
          isPlaying={isPlaying}
          isLoading={playerState.isLoading}
          reduceMotion={reduceMotion}
          onArtError={() => setFailedArtSongId(song.id)}
        />

        <div className="min-w-0 flex-1" aria-live="polite">
          <p
            className={`flex items-center gap-1.5 font-mono text-[10px] uppercase leading-none tracking-[0.16em] md:text-[11px] ${
              isPlaying ? 'text-tally' : 'text-muted-foreground'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isPlaying ? 'animate-pulse bg-tally' : 'bg-muted-foreground/40'
              }`}
              aria-hidden
            />
            {isPlaying ? 'Al aire' : 'En espera'}
          </p>
          <p className="mt-1 flex min-w-0 items-baseline gap-1.5 text-[15px] leading-tight md:text-base">
            <span className="truncate font-display" title={title}>
              {title}
            </span>
            {artist && (
              <span className="hidden min-w-0 shrink truncate font-mono text-xs text-muted-foreground sm:inline">
                {artist}
              </span>
            )}
          </p>
        </div>

        <div className="hidden shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums text-muted-foreground sm:flex">
          <span className="text-foreground/80">{formatTime(elapsed)}</span>
          <span aria-hidden>/</span>
          <span>{hasProgress ? formatTime(duration) : '--:--'}</span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Phones get tap-to-mute only: a slider cannot be aimed precisely
              at 44px, and the stream must never be stuck inaudible. */}
          <button
            onClick={toggleMute}
            className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
          >
            {isMuted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
          </button>

          <div className="hidden items-center gap-1 rounded-full border border-border/60 bg-card/70 py-1 pl-1 pr-3 md:flex">
            <button
              onClick={toggleMute}
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {isMuted ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
            </button>
            <Slider
              value={[isMuted ? 0 : playerState.volume]}
              onValueChange={([v]) => setVolume(v ?? 0)}
              max={100}
              step={1}
              className="w-20 [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-primary [&_[data-slot=slider-thumb]]:bg-foreground"
              aria-label="Volumen"
            />
          </div>

          {isTopDocked && (
            <button
              onClick={scrollToTop}
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-[transform,background-color,color] duration-150 ease-out hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Volver al inicio"
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
          )}

          <button
            onClick={togglePlay}
            disabled={playerState.isLoading}
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
            className="play-button-shadow flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70"
          >
            {playerState.isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" aria-hidden />
            ) : isPlaying ? (
              <Pause className="h-4 w-4 fill-current" aria-hidden />
            ) : (
              <Play className="h-4 w-4 translate-x-px fill-current" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {isTopDocked && signalHairline}
    </motion.div>
  );
}
