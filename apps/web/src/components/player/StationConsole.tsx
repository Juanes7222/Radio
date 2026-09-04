import { useState, useEffect, useCallback, type RefObject } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Volume2,
  VolumeX,
  Radio,
  Wifi,
  Settings,
  Heart,
  Share2,
  Send,
  Timer,
  Bell,
  BellOff,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useFavoriteNotify, SLEEP_PRESETS } from '@/hooks';
import type { NowPlayingData, StreamQuality, PlayerState } from '@radio/types';
import { WaveformVisualizer } from './WaveformVisualizer';
import { formatMediaTitle } from '@/lib/formatMedia';
import { formatTime } from '@/lib/utils';
import { VinylDisc } from '@/components/ui-custom/VinylDisc';
import { ShareModal } from '../ui-custom/SharedModla';
import { BiblePanel } from '../bible/BiblePanel';
import { StationLogo } from '@/components/ui-custom/OptimizedLogo';

interface StationConsoleProps {
  stationData: NowPlayingData | null;
  isLoading: boolean;
  error: string | null;
  playerState: PlayerState;
  analyserRef: RefObject<AnalyserNode | null>;
  reconnectAttempt: number;
  onTogglePlay: () => void;
  onSetVolume: (v: number) => void;
  onToggleMute: () => void;
  onSetQuality: (q: StreamQuality) => void;
  onClearError: () => void;
  sleepTimer: { isActive: boolean; display: string; cancel: () => void; start: (minutes: number) => void };
  onShowRequests?: () => void;
}

function PlayIcon() {
  return (
    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-signal">
      <svg className="w-6 h-6 text-primary-foreground ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  );
}

function PauseIcon() {
  return (
    <svg className="w-10 h-10 text-white/80" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="4" width="4" height="16" rx="1.5" />
      <rect x="14" y="4" width="4" height="16" rx="1.5" />
    </svg>
  );
}

export function StationConsole({
  stationData,
  isLoading,
  error,
  playerState,
  analyserRef,
  reconnectAttempt,
  onTogglePlay,
  onSetVolume,
  onToggleMute,
  onSetQuality,
  onClearError,
  sleepTimer,
  onShowRequests,
}: StationConsoleProps) {
  const [quality, setQuality] = useState<StreamQuality>('128');
  const [artworkErrorSongId, setArtworkErrorSongId] = useState<string | null>(null);
  const [favoriteSongKeys, setFavoriteSongKeys] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('radio-favorite-songs') || '[]');
    } catch {
      return [];
    }
  });
  const [shareOpen, setShareOpen] = useState(false);
  const [bibleOpen, setBibleOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const currentSong = stationData?.now_playing ?? null;
  const songData = currentSong?.song ?? null;
  const { title, artist, isPreaching } = formatMediaTitle(songData?.title ?? '', songData?.artist ?? '');
  const displayArtist = artist || null;
  const artworkLoadFailed = artworkErrorSongId === (songData?.id ?? null);
  const artworkUrl = songData?.art && !artworkLoadFailed ? songData.art : null;

  const currentSongKey = (() => {
    const s = stationData?.now_playing?.song;
    if (!s?.title || s.title === 'Unknown') return null;
    return `${s.artist ?? ''}::${s.title}`.toLowerCase();
  })();
  const isFavorite = currentSongKey
    ? favoriteSongKeys.some((k) => k.toLowerCase() === currentSongKey)
    : false;

  const currentSongForNotify = currentSong
    ? { id: currentSong.song?.id ?? '', title: currentSong.song?.title ?? '', artist: currentSong.song?.artist ?? '', art: currentSong.song?.art }
    : null;
  const favoriteNotify = useFavoriteNotify(currentSongForNotify, favoriteSongKeys);

  const isLive = stationData?.live?.is_live ?? false;
  const listeners = stationData?.listeners?.current ?? 0;

  const handleQualityChange = useCallback((newQuality: StreamQuality) => {
    setQuality(newQuality);
    onSetQuality(newQuality);
  }, [onSetQuality]);

  const toggleFavorite = useCallback(() => {
    if (!currentSongKey) return;
    const next = isFavorite
      ? favoriteSongKeys.filter((k) => k.toLowerCase() !== currentSongKey)
      : [...favoriteSongKeys, currentSongKey];
    localStorage.setItem('radio-favorite-songs', JSON.stringify(next));
    setFavoriteSongKeys(next);
  }, [currentSongKey, isFavorite, favoriteSongKeys]);

  // Space to toggle play (a11y / Emil polish)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        const active = document.activeElement;
        if (active?.getAttribute('role') === 'slider') return;
        e.preventDefault();
        onTogglePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTogglePlay]);

  // Dial de Luz — level reactive to real audio via AnalyserNode
  const [audioLevel, setAudioLevel] = useState(0);
  useEffect(() => {
    if (shouldReduceMotion || !playerState.isPlaying || !analyserRef.current) {
      setAudioLevel(0);
      return;
    }
    const analyser = analyserRef.current;
    // Use low frequencies for pulse (bass) — more musical than full spectrum
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      // Throttle to ~12fps to avoid excessive state churn
      if (now - last < 80) return;
      last = now;
      analyser.getByteFrequencyData(data);
      // Average of first 18 bins (~0-1.5kHz) captures kick/bass
      let sum = 0;
      const count = Math.min(18, data.length);
      for (let i = 0; i < count; i++) sum += data[i];
      const avg = sum / count / 255; // 0..1
      // Smooth with EMA to avoid jitter
      setAudioLevel((prev) => prev * 0.7 + avg * 0.3);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playerState.isPlaying, analyserRef, shouldReduceMotion]);

  const discRotation = shouldReduceMotion
    ? { rotate: 0 }
    : playerState.isLoading || playerState.isPlaying
      ? { rotate: 360 }
      : { rotate: 0 };

  const discTransition = shouldReduceMotion
    ? { duration: 0 }
    : playerState.isLoading
      ? { duration: 5, repeat: Infinity, ease: 'linear' as const }
      : playerState.isPlaying
        ? { duration: 22, repeat: Infinity, ease: 'linear' as const }
        : { duration: 0.7, ease: 'easeOut' as const };

  const progressPct = currentSong && currentSong.duration > 0
    ? Math.min(100, Math.max(0, (currentSong.elapsed / currentSong.duration) * 100))
    : 0;

  return (
    <>
      <ShareModal open={shareOpen} onOpenChange={setShareOpen} stationName={stationData?.station?.name || 'La Voz de la Verdad'} />
      <BiblePanel isOpen={bibleOpen} onClose={() => setBibleOpen(false)} />

      {/* Skip link for keyboard users */}
      <a href="#station-console" className="skip-link focus:not-sr-only">Saltar al reproductor</a>

      <section
        id="station-console"
        aria-label="Consola de la estación"
        className="relative overflow-hidden border-b border-border/50 flex flex-col min-h-[calc(100dvh-64px)]"
      >
        {/* Ambient background: blurred artwork + ink gradients */}
        <div className="absolute inset-0 bg-background" aria-hidden />
        <div className="absolute inset-0" aria-hidden>
          <AnimatePresence>
            {artworkUrl && (
              <motion.div
                key={artworkUrl}
                initial={{ opacity: 0, filter: 'blur(8px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-0 scale-125 blur-[42px] opacity-[0.18] will-change-transform"
                style={{ backgroundImage: `url(${artworkUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
              />
            )}
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/70 to-background" />
          <div className="absolute inset-0 hero-glow opacity-60" />
        </div>

        {/* Top meta bar — más baja en mobile */}
        <div className="relative border-b border-border/30 bg-card/20 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl px-4 md:px-6 h-8 md:h-9 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest uppercase text-muted-foreground">
                <span className={`w-1.5 h-1.5 rounded-full ${playerState.isPlaying ? 'bg-tally animate-pulse' : 'bg-muted-foreground/40'}`} />
                {playerState.isPlaying ? 'Al aire' : 'En espera'}
              </span>
              {isLive ? (
                <Badge variant="destructive" className="h-5 px-2 text-[10px] tracking-widest uppercase">En vivo</Badge>
              ) : (
                <Badge variant="secondary" className="h-5 px-2 text-[10px] tracking-widest uppercase">AutoDJ</Badge>
              )}
              <span className="hidden md:inline-flex items-center gap-1 text-muted-foreground">
                <Wifi className="w-3 h-3" aria-hidden />
                <span className="font-mono tabular-nums">{listeners}</span> oyentes
              </span>
            </div>
            
          </div>
          {/* Signal hairline progress — scaleX for GPU */}
          {currentSong && (
            <div className="h-[2px] w-full bg-border/50 overflow-hidden" aria-hidden>
              <motion.div
                className="h-full bg-primary origin-left will-change-transform"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: progressPct / 100 }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>
          )}
        </div>

        <div className="relative mx-auto max-w-6xl w-full flex-1 flex flex-col justify-center px-4 md:px-6 py-3 md:py-6">
          {/* Logo — compacto en mobile para liberar altura */}
          <motion.div
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="flex justify-center mb-2 md:mb-5"
          >
            <div className="w-32 md:w-44 opacity-90">
              <StationLogo priority className="w-full h-auto" />
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-8 items-center flex-1">
            {/* Disco / Dial de luz — firma del rediseño */}
            <motion.div
              initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="md:col-span-5 flex flex-col items-center gap-2 md:gap-3 justify-center"
            >
              <div className="relative">
                {/* Halo Dial de Luz — único indicador vivo, sin duplicar botón */}
                {playerState.isPlaying && !shouldReduceMotion && (
                  <>
                    {analyserRef.current ? (
                      <>
                        <div
                          className="absolute -inset-5 rounded-full border border-primary/30 pointer-events-none transition-transform duration-100 ease-out will-change-transform"
                          style={{
                            transform: `scale(${1 + audioLevel * 0.12})`,
                            opacity: 0.18 + audioLevel * 0.32,
                          }}
                          aria-hidden
                        />
                        <div
                          className="absolute -inset-8 rounded-full border border-primary/15 pointer-events-none transition-transform duration-150 ease-out will-change-transform"
                          style={{
                            transform: `scale(${1 + audioLevel * 0.08})`,
                            opacity: 0.1 + audioLevel * 0.2,
                          }}
                          aria-hidden
                        />
                        <div
                          className="absolute -inset-2 rounded-full pointer-events-none blur-xl transition-opacity duration-100"
                          style={{
                            background: `radial-gradient(circle, hsl(var(--primary) / ${0.08 + audioLevel * 0.12}) 0%, transparent 70%)`,
                            opacity: 0.55 + audioLevel * 0.35,
                          }}
                          aria-hidden
                        />
                      </>
                    ) : (
                      <>
                        <motion.div
                          className="absolute -inset-5 rounded-full border border-primary/25 pointer-events-none"
                          animate={{ scale: [1, 1.07, 1], opacity: [0.32, 0.12, 0.32] }}
                          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                          aria-hidden
                        />
                        <motion.div
                          className="absolute -inset-8 rounded-full border border-primary/10 pointer-events-none"
                          animate={{ scale: [1, 1.05, 1], opacity: [0.16, 0.06, 0.16] }}
                          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                          aria-hidden
                        />
                      </>
                    )}
                  </>
                )}

                {/* Anillo de carga sutil */}
                {playerState.isLoading && (
                  <motion.div
                    className="absolute -inset-3 rounded-full border border-primary/60 pointer-events-none"
                    animate={shouldReduceMotion ? undefined : { opacity: [0.6, 0.15, 0.6], scale: [1, 1.04, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    aria-hidden
                  />
                )}

                {/* Borde sutil */}
                <div className="absolute -inset-2 rounded-full border border-border/30 pointer-events-none" aria-hidden />
                <div className="absolute -inset-5 rounded-full border border-border/10 pointer-events-none hidden md:block" aria-hidden />

                <motion.button
                  key={songData?.id ?? 'no-song'}
                  initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                  onClick={onTogglePlay}
                  className="relative focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full will-change-transform"
                  aria-label={playerState.isPlaying ? 'Pausar reproducción' : 'Reproducir emisora'}
                >
                  {artworkUrl && (
                    <div
                      className="absolute -inset-4 rounded-full blur-2xl opacity-30 pointer-events-none hidden md:block"
                      style={{ backgroundImage: `url(${artworkUrl})`, backgroundSize: 'cover' }}
                      aria-hidden
                    />
                  )}

                  <motion.div
                    animate={discRotation}
                    transition={discTransition}
                    className="relative w-48 h-48 md:w-[268px] md:h-[268px] rounded-full overflow-hidden shadow-console ring-1 ring-white/10"
                  >
                    {artworkUrl ? (
                      <img
                        src={artworkUrl}
                        alt={songData?.album ? `Carátula de ${songData.album}` : 'Carátula del programa actual'}
                        className="w-full h-full object-cover"
                        loading="eager"
                        decoding="async"
                        onError={() => songData?.id && setArtworkErrorSongId(songData.id)}
                      />
                    ) : (
                      <VinylDisc />
                    )}
                    <div className="absolute inset-0 rounded-full vinyl-groove-overlay pointer-events-none" aria-hidden />
                    {/* Spindle */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
                      <div className="w-7 h-7 rounded-full bg-background/90 border border-white/10 flex items-center justify-center shadow-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/70" />
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    className="absolute inset-0 rounded-full flex items-center justify-center"
                    animate={{ backgroundColor: playerState.isPlaying ? 'rgba(0,0,0,0)' : 'rgba(10,14,26,0.52)' }}
                    transition={{ duration: 0.25 }}
                    aria-hidden
                  >
                    {!playerState.isLoading && !playerState.isPlaying && <PlayIcon />}
                    {!playerState.isLoading && playerState.isPlaying && (
                      <motion.div
                        className="w-full h-full flex items-center justify-center opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity"
                        whileTap={{ opacity: 1 }}
                      >
                        <PauseIcon />
                      </motion.div>
                    )}
                  </motion.div>
                  {playerState.isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
                      <div className="w-10 h-10 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                  )}
                </motion.button>
              </div>

              {sleepTimer.isActive && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                  className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full"
                  role="status"
                  aria-live="polite"
                >
                  <Timer className="w-4 h-4" aria-hidden />
                  <span>Apagado en {sleepTimer.display}</span>
                  <button onClick={sleepTimer.cancel} className="text-xs underline underline-offset-2 hover:opacity-80 ml-1">Cancelar</button>
                </motion.div>
              )}
              <p className="hidden md:block text-[11px] font-mono tracking-widest uppercase text-muted-foreground/60">
                Espacio para {playerState.isPlaying ? 'pausar' : 'reproducir'}
              </p>
            </motion.div>

            {/* Metadata — centrado, compacto en mobile */}
            <motion.div
              initial={shouldReduceMotion ? undefined : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="md:col-span-7 flex flex-col gap-2.5 md:gap-4 items-center text-center"
            >
              {/* Eyebrow — centrado */}
              <div className="flex items-center justify-center gap-2 text-xs">
                <Radio className="w-3.5 h-3.5 text-primary" aria-hidden />
                <span className="font-mono tracking-[0.14em] uppercase text-primary font-semibold">La Voz de la Verdad</span>
                <span className="hidden sm:inline-flex items-center gap-1.5 ml-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${playerState.isPlaying ? 'bg-tally animate-pulse' : 'bg-muted-foreground/30'}`} aria-hidden />
                  <span className={`font-mono text-[11px] tracking-widest uppercase ${playerState.isPlaying ? 'text-tally' : 'text-muted-foreground'}`}>
                    {playerState.isPlaying ? 'En vivo' : 'Fuera del aire'}
                  </span>
                </span>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={songData?.id ?? 'no-info'}
                  initial={shouldReduceMotion ? undefined : { opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
                  transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}
                  className="space-y-3 flex flex-col items-center w-full will-change-transform"
                >
                  {isLoading ? (
                    <div className="space-y-3 w-full flex flex-col items-center">
                      <div className="h-9 w-3/4 rounded-lg bg-muted animate-shimmer relative overflow-hidden">
                        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" aria-hidden />
                      </div>
                      <div className="h-4 w-1/2 rounded-full bg-muted/70 animate-shimmer relative overflow-hidden">
                        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" aria-hidden />
                      </div>
                      <div className="h-4 w-24 rounded-full bg-muted/50 animate-pulse" />
                    </div>
                  ) : (
                    <>
                      {isPreaching ? (
                        <span className="inline-flex text-[11px] font-bold uppercase tracking-widest text-primary border border-primary/30 rounded-full px-3 py-1">
                          Prédica
                        </span>
                      ) : (
                        <span className="inline-flex md:hidden items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-tally">
                          <span className="w-1.5 h-1.5 rounded-full bg-tally animate-pulse" aria-hidden /> En vivo
                        </span>
                      )}
                      <h1 className="font-display text-[1.7rem] md:text-4xl font-normal leading-[0.95] tracking-tight text-foreground line-clamp-2 text-center">
                        {title || 'La Voz de la Verdad'}
                      </h1>
                      <p className="font-mono text-sm md:text-[15px] text-muted-foreground min-h-[20px] text-center">
                        {displayArtist || 'Radio cristiana · Cartago, Colombia'}
                      </p>
                      {currentSong?.playlist && (
                        <span className="text-xs text-muted-foreground font-mono text-center">
                          {currentSong.playlist}
                        </span>
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Waveform — compacto en mobile */}
              <div className="w-full rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
                <div className="px-3 pt-2 md:pt-3">
                  <WaveformVisualizer analyserNode={analyserRef} isPlaying={playerState.isPlaying && !playerState.isLoading} />
                </div>
                {currentSong && (
                  <div className="px-3 pb-2 md:pb-3 pt-1.5 md:pt-2">
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-muted-foreground mb-1">
                      <span>{formatTime(currentSong.elapsed)}</span>
                      <span>{formatTime(currentSong.duration)}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(progressPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de la canción">
                      <motion.div
                        className="h-full bg-primary rounded-full origin-left will-change-transform"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: progressPct / 100 }}
                        transition={{ duration: 1, ease: 'linear' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Toolbar — centrada, sin duplicar play */}
              <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                {/* Volume */}
                <div className="flex items-center gap-2 bg-card border border-border rounded-full px-2 py-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={onToggleMute} aria-label={playerState.isMuted || playerState.volume === 0 ? 'Activar sonido' : 'Silenciar'}>
                    {playerState.isMuted || playerState.volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  <div className="w-20 hidden sm:block">
                    <Slider
                      value={[playerState.isMuted ? 0 : playerState.volume]}
                      onValueChange={([v]) => onSetVolume(v ?? 0)}
                      max={100}
                      step={1}
                      aria-label="Volumen"
                    />
                  </div>
                  <span className="hidden sm:inline text-xs font-mono tabular-nums text-muted-foreground w-7 text-right">
                    {playerState.isMuted ? 0 : Math.round(playerState.volume)}%
                  </span>
                </div>

                <div className="flex items-center justify-center gap-1.5">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" className="rounded-full border-border bg-card" onClick={() => setBibleOpen(true)} aria-label="Abrir Biblia">
                          <BookOpen className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Biblia</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`rounded-full ${favoriteNotify.isEnabled ? 'text-amber-500' : ''}`}
                          onClick={() => favoriteNotify.isEnabled ? favoriteNotify.disable() : favoriteNotify.enable()}
                          aria-label={favoriteNotify.isEnabled ? 'Desactivar aviso de favoritas' : 'Activar aviso de favoritas'}
                          aria-pressed={favoriteNotify.isEnabled}
                        >
                          {favoriteNotify.isEnabled ? <Bell className="w-4 h-4 fill-current" /> : <BellOff className="w-4 h-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{favoriteNotify.isEnabled ? 'Aviso de favoritas activo' : 'Activar aviso'}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`rounded-full ${isFavorite ? 'text-tally' : ''}`}
                          onClick={toggleFavorite}
                          disabled={!currentSongKey}
                          aria-label={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                          aria-pressed={isFavorite}
                        >
                          <Heart className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{!currentSongKey ? 'Sin canción activa' : isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShareOpen(true)} aria-label="Compartir emisora">
                    <Share2 className="w-4 h-4" />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="rounded-full border-border bg-card" aria-label="Ajustes de reproducción">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem disabled className="text-xs text-muted-foreground">Calidad del stream</DropdownMenuItem>
                      {(['64', '128', '320'] as StreamQuality[]).map((q) => (
                        <DropdownMenuItem key={q} onClick={() => handleQualityChange(q)} className={quality === q ? 'bg-primary/10 text-primary font-medium' : ''}>
                          {q} kbps {quality === q && '✓'}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled className="text-xs text-muted-foreground"><Timer className="w-3 h-3 mr-1" /> Apagado automático</DropdownMenuItem>
                      {sleepTimer.isActive ? (
                        <DropdownMenuItem onClick={sleepTimer.cancel} className="text-amber-600 dark:text-amber-500">Cancelar ({sleepTimer.display})</DropdownMenuItem>
                      ) : (
                        SLEEP_PRESETS.map((min) => (
                          <DropdownMenuItem key={min} onClick={() => sleepTimer.start(min)}>En {min} min</DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button onClick={onShowRequests} className="rounded-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90" size="sm">
                    <Send className="w-4 h-4" aria-hidden />
                    <span className="hidden sm:inline">Pedir canción</span>
                    <span className="sm:hidden">Pedir</span>
                  </Button>
                </div>
              </div>

              <AnimatePresence>
                {(error || playerState.error) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl border p-3 text-sm flex items-center gap-2 bg-card"
                    role="alert"
                  >
                    <Wifi className="w-4 h-4 text-tally shrink-0" aria-hidden />
                    <span className="flex-1 text-muted-foreground">{playerState.error || error}</span>
                    {reconnectAttempt === 0 && (
                      <Button variant="ghost" size="sm" onClick={onClearError}>Cerrar</Button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
