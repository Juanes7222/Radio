import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Radio, 
  Wifi,
  WifiOff,
  Settings,
  Heart,
  Share2,
  ListMusic,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAudioPlayer, useMediaSession } from '@/hooks';
import type { NowPlayingData, StreamQuality } from '@/types/azuracast';
import { WaveformVisualizer } from './WaveformVisualizer';
import { SongInfo } from './SongInfo';
import { formatTime } from '@/lib/utils';

interface RadioPlayerProps {
  stationData: NowPlayingData | null;
  streamUrl: string;
  isLoading: boolean;
  error: string | null;
  onQualityChange?: (quality: StreamQuality) => void;
  onShowHistory?: () => void;
  onShowRequests?: () => void;
}

export function RadioPlayer({
  stationData,
  streamUrl,
  isLoading,
  error,
  onQualityChange,
  onShowHistory,
  onShowRequests,
}: RadioPlayerProps) {
  const [quality, setQuality] = useState<StreamQuality>('128');
  const [isFavorite, setIsFavorite] = useState(false);
  
  const { 
    audioRef, 
    state, 
    togglePlay, 
    setVolume, 
    toggleMute,
    setQuality: setPlayerQuality,
    clearError 
  } = useAudioPlayer({ 
    streamUrl,
  });

  // Media Session API
  useMediaSession({
    title: stationData?.now_playing?.song?.title || 'Radio Stream',
    artist: stationData?.now_playing?.song?.artist || 'Desconocido',
    album: stationData?.now_playing?.song?.album || '',
    artwork: stationData?.now_playing?.song?.art || '',
    onPlay: togglePlay,
    onPause: togglePlay,
  });

  // Verificar si es favorito
  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem('radio-favorites') || '[]');
    setIsFavorite(favorites.includes(stationData?.station?.id));
  }, [stationData?.station?.id]);

  const handleQualityChange = (newQuality: StreamQuality) => {
    setQuality(newQuality);
    setPlayerQuality(newQuality);
    onQualityChange?.(newQuality);
  };

  const toggleFavorite = () => {
    const favorites = JSON.parse(localStorage.getItem('radio-favorites') || '[]');
    const stationId = stationData?.station?.id;
    
    if (!stationId) return;

    if (isFavorite) {
      const newFavorites = favorites.filter((id: number) => id !== stationId);
      localStorage.setItem('radio-favorites', JSON.stringify(newFavorites));
    } else {
      favorites.push(stationId);
      localStorage.setItem('radio-favorites', JSON.stringify(favorites));
    }
    
    setIsFavorite(!isFavorite);
  };

  const shareStation = async () => {
    const shareData = {
      title: stationData?.station?.name || 'Radio Stream',
      text: `Escuchando ${stationData?.now_playing?.song?.title} en ${stationData?.station?.name}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          // Si share falla por algún motivo, copiar al portapapeles
          await copyToClipboard(`${shareData.title} — ${shareData.text}\n${shareData.url}`);
        }
      }
    } else {
      await copyToClipboard(`${shareData.title} — ${shareData.text}\n${shareData.url}`);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Enlace copiado al portapapeles');
    } catch {
      toast.error('No se pudo copiar. Copia manualmente: ' + window.location.href);
    }
  };

  const isLive = stationData?.live?.is_live || false;
  const listeners = stationData?.listeners?.current || 0;
  const currentSong = stationData?.now_playing || null;
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Card principal del reproductor */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`
          relative overflow-hidden rounded-3xl 
          ${theme === 'dark' 
            ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' 
            : 'bg-gradient-to-br from-white via-slate-50 to-slate-100'
          }
          shadow-2xl border ${theme === 'dark' ? 'border-slate-700' : 'border-slate-200'}
        `}
      >
        {/* Header con estado */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/30">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Radio className="w-6 h-6 text-primary" />
              {state.isPlaying && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-lg">{stationData?.station?.name || 'Radio Stream'}</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {isLive ? (
                  <Badge variant="destructive" className="animate-pulse">EN VIVO</Badge>
                ) : (
                  <Badge variant="secondary">AutoDJ</Badge>
                )}
                <span className="flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  {listeners} oyentes
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFavorite}
                    className={isFavorite ? 'text-red-500' : ''}
                  >
                    <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={shareStation}>
                    <Share2 className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Compartir</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  Calidad del stream
                </DropdownMenuItem>
                {(['64', '128', '320'] as StreamQuality[]).map((q) => (
                  <DropdownMenuItem
                    key={q}
                    onClick={() => handleQualityChange(q)}
                    className={quality === q ? 'bg-primary/10' : ''}
                  >
                    {q} kbps {quality === q && '✓'}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Visualizador de onda */}
        <div className="px-6 py-4">
          <WaveformVisualizer 
            audioElement={audioRef.current}
            isPlaying={state.isPlaying}
            theme={theme}
          />
        </div>

        {/* Información de la canción */}
        <div className="px-6 pb-4">
          <SongInfo 
            song={currentSong}
            isLoading={isLoading}
            theme={theme}
          />
        </div>

        {/* Controles principales */}
        <div className="px-6 pb-6">
          <div className="flex items-center justify-center gap-6">
            {/* Botón Play/Pause */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={togglePlay}
              disabled={state.isLoading}
              className={`
                w-20 h-20 rounded-full flex items-center justify-center
                ${theme === 'dark'
                  ? 'bg-white text-slate-900 hover:bg-slate-100'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
                }
                shadow-lg transition-all disabled:opacity-50
              `}
            >
              {state.isLoading ? (
                <div className="w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin" />
              ) : state.isPlaying ? (
                <Pause className="w-8 h-8" />
              ) : (
                <Play className="w-8 h-8 ml-1" />
              )}
            </motion.button>
          </div>

          {/* Controles secundarios */}
          <div className="flex items-center justify-between mt-6">
            {/* Volumen */}
            <div className="flex items-center gap-2 flex-1 max-w-[200px]">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
              >
                {state.isMuted || state.volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </Button>
              <div className="flex-1">
                <Slider
                  value={[state.isMuted ? 0 : state.volume]}
                  onValueChange={([v]) => setVolume(v)}
                  max={100}
                  step={1}
                  className="w-full"
                />
              </div>
              <span className="text-xs text-muted-foreground w-8">
                {state.isMuted ? 0 : state.volume}%
              </span>
            </div>

            {/* Botones adicionales */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onShowHistory}
                className="gap-2"
              >
                <ListMusic className="w-4 h-4" />
                Historial
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onShowRequests}
                className="gap-2"
              >
                <Bell className="w-4 h-4" />
                Pedir
              </Button>
            </div>
          </div>
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-4"
            >
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                <WifiOff className="w-4 h-4" />
                <span className="flex-1">{error}</span>
                <Button variant="ghost" size="sm" onClick={clearError}>
                  Cerrar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progreso de la canción */}
        {currentSong && (
          <div className="px-6 pb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>{formatTime(currentSong.elapsed)}</span>
              <span>{formatTime(currentSong.duration)}</span>
            </div>
            <div className="h-1 bg-slate-700/30 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ 
                  width: `${(currentSong.elapsed / currentSong.duration) * 100}%` 
                }}
                transition={{ duration: 1, ease: 'linear' }}
              />
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
