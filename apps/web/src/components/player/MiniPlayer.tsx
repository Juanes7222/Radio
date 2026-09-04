import { useGlobalAudio } from '@/hooks/useGlobalAudio';
import { Play, Pause, Volume2, VolumeX, Radio } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

export function MiniPlayer() {
  const { data, playerState, togglePlay, toggleMute, setVolume } = useGlobalAudio();

  if (!data?.now_playing) return null;

  const { song } = data.now_playing;
  const isPlaying = playerState.isPlaying;
  const progress = data.now_playing.duration > 0 ? (data.now_playing.elapsed / data.now_playing.duration) * 100 : 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card/95 backdrop-blur-xl border-border supports-[backdrop-filter]:bg-card/80 shadow-console"
      role="region"
      aria-label="Reproductor minimizado"
    >
      <div className="h-[2px] w-full bg-border/50 overflow-hidden" aria-hidden>
        <div className="h-full bg-primary transition-all duration-1000 linear" style={{ width: `${progress}%` }} />
      </div>
      <div className="h-[4.5rem] md:h-20 flex items-center justify-between px-4 md:px-6 gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative h-11 w-11 md:h-12 md:w-12 rounded-xl overflow-hidden bg-muted shrink-0 flex items-center justify-center ring-1 ring-border">
            {song.art ? (
              <img src={song.art} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <Radio className="h-5 w-5 text-muted-foreground" aria-hidden />
            )}
            {isPlaying && <span className="absolute inset-0 rounded-xl ring-1 ring-primary/20 animate-pulse" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate leading-tight" title={song.title}>
              {song.title || 'La Voz de la Verdad'}
            </p>
            <p className="text-xs text-muted-foreground truncate font-mono" title={song.artist}>
              {song.artist || 'Radio cristiana · 24/7'}
            </p>
          </div>
          {isPlaying && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-tally ml-2 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-tally animate-pulse" aria-hidden /> En vivo
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={togglePlay}
            className="h-10 w-10 md:h-11 md:w-11 rounded-full flex items-center justify-center bg-primary text-primary-foreground hover:brightness-105 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
          >
            {isPlaying ? <Pause className="h-5 w-5 fill-current" aria-hidden /> : <Play className="h-5 w-5 fill-current translate-x-0.5" aria-hidden />}
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2 w-40 justify-end shrink-0">
          <button
            onClick={toggleMute}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={playerState.isMuted ? 'Activar sonido' : 'Silenciar'}
          >
            {playerState.isMuted || playerState.volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <Slider
            value={[playerState.isMuted ? 0 : playerState.volume]}
            onValueChange={([v]) => setVolume(v ?? 0)}
            max={100}
            step={1}
            className="w-24"
            aria-label="Volumen"
          />
        </div>
      </div>
    </div>
  );
}
