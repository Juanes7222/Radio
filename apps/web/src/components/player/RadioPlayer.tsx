import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Send,
  Timer,
  Bell,
  BellOff,
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
import { useAudioPlayer, useMediaSession, useSleepTimer, SLEEP_PRESETS, useFavoriteNotify } from '@/hooks';
import type { NowPlayingData, StreamQuality } from '@/types/azuracast';
import { WaveformVisualizer } from './WaveformVisualizer';
import { SongInfo } from './SongInfo';
import { formatTime } from '@/lib/utils';
import { ShareModal } from '../ui-custom/SharedModla';

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
  const [localFavorites, setLocalFavorites] = useState<number[]>(() =>
    JSON.parse(localStorage.getItem('radio-favorites') || '[]')
  );
  const isFavorite = localFavorites.includes(stationData?.station?.id ?? -1);

  // Datos de la canción actual — declarados aquí para usarlos en hooks
  const currentSong = stationData?.now_playing || null;
  
  const { 
    audioRef, 
    state, 
    togglePlay, 
    setVolume, 
    toggleMute,
    pause,
    setQuality: setPlayerQuality,
    clearError,
    reconnectAttempt,
  } = useAudioPlayer({ streamUrl });

  // Sleep timer: apagar tras N minutos
  const sleepTimer = useSleepTimer(() => {
    pause();
  });

  // Notificación de canción favorita
  const currentSongForNotify = currentSong
    ? {
        id: currentSong.song?.id ?? '',
        title: currentSong.song?.title ?? '',
        artist: currentSong.song?.artist ?? '',
        art: currentSong.song?.art,
      }
    : null;
  const favoriteNotify = useFavoriteNotify(currentSongForNotify, localFavorites);

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
  // (derivado de localFavorites — sin useEffect)

  const handleQualityChange = (newQuality: StreamQuality) => {
    setQuality(newQuality);
    setPlayerQuality(newQuality);
    onQualityChange?.(newQuality);
  };

  const toggleFavorite = () => {
    const stationId = stationData?.station?.id;
    if (!stationId) return;

    const newFavorites = isFavorite
      ? localFavorites.filter((id) => id !== stationId)
      : [...localFavorites, stationId];

    localStorage.setItem('radio-favorites', JSON.stringify(newFavorites));
    setLocalFavorites(newFavorites);
  };



  const isLive = stationData?.live?.is_live || false;
  const listeners = stationData?.listeners?.current || 0;
  const [shareOpen, setShareOpen] = useState(false);
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

  return (

    <>
    <ShareModal
      open={shareOpen}
      onOpenChange={setShareOpen}
      stationName={stationData?.station?.name || 'Radio Stream'}
    />

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
                    onClick={() =>
                      favoriteNotify.isEnabled
                        ? favoriteNotify.disable()
                        : favoriteNotify.enable()
                    }
                    className={favoriteNotify.isEnabled ? 'text-yellow-500' : ''}
                    title={favoriteNotify.isEnabled ? 'Desactivar avisos de favoritos' : 'Avisar cuando suene una favorita'}
                  >
                    {favoriteNotify.isEnabled ? (
                      <Bell className="w-5 h-5 fill-current" />
                    ) : (
                      <BellOff className="w-5 h-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{favoriteNotify.isEnabled ? 'Desactivar aviso de favoritas' : 'Activar aviso de favoritas'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

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
                  <Button variant="ghost" size="icon" onClick={() => setShareOpen(true)}>
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

                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  <Timer className="w-3 h-3 mr-1" /> Apagado automático
                </DropdownMenuItem>
                {sleepTimer.isActive ? (
                  <DropdownMenuItem onClick={sleepTimer.cancel} className="text-amber-500">
                    Cancelar ({sleepTimer.display})
                  </DropdownMenuItem>
                ) : (
                  SLEEP_PRESETS.map((min) => (
                    <DropdownMenuItem key={min} onClick={() => sleepTimer.start(min)}>
                      En {min} min
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Visualizador de onda */}
        <div className="px-6 py-4">
          <WaveformVisualizer 
            audioElement={audioRef}
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

          {/* Indicador de sleep timer activo */}
          <AnimatePresence>
            {sleepTimer.isActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center justify-center gap-2 mt-3 text-sm text-amber-500"
              >
                <Timer className="w-4 h-4" />
                <span>Apagado en {sleepTimer.display}</span>
                <button
                  onClick={sleepTimer.cancel}
                  className="text-xs underline opacity-70 hover:opacity-100"
                >
                  Cancelar
                </button>
              </motion.div>
            )}
          </AnimatePresence>

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
                variant="default"
                size="sm"
                onClick={onShowRequests}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                Pedir canción
              </Button>
            </div>
          </div>
        </div>

        {/* Error / Reconexion */}
        <AnimatePresence>
          {(error || state.error) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-4"
            >
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                reconnectAttempt > 0
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'bg-red-500/10 text-red-500'
              }`}>
                <WifiOff className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{state.error || error}</span>
                {reconnectAttempt === 0 && (
                  <Button variant="ghost" size="sm" onClick={clearError}>
                    Cerrar
                  </Button>
                )}
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
      </>
  );
}
