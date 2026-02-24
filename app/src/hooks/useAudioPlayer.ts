import { useState, useRef, useCallback, useEffect } from 'react';
import type { StreamQuality, PlayerState } from '@/types/azuracast';

interface UseAudioPlayerProps {
  streamUrl: string;
}

export function useAudioPlayer({ streamUrl }: UseAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    isMuted: false,
    volume: 80,
    quality: '128',
    isLive: false,
    isLoading: false,
    error: null,
  });

  // Inicializar audio element
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'none';
    audioRef.current = audio;

    const handlePlay = () => {
      setState(prev => ({ ...prev, isPlaying: true, isLoading: false }));
    };

    const handlePause = () => {
      setState(prev => ({ ...prev, isPlaying: false }));
    };

    const handleWaiting = () => {
      setState(prev => ({ ...prev, isLoading: true }));
    };

    const handleCanPlay = () => {
      setState(prev => ({ ...prev, isLoading: false }));
    };

    const handleError = (e: Event) => {
      const target = e.target as HTMLAudioElement;
      let errorMessage = 'Error al reproducir el stream';
      
      if (target.error) {
        switch (target.error.code) {
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Error de red. Verifica tu conexión.';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Error al decodificar el audio.';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Formato de audio no soportado.';
            break;
          default:
            errorMessage = 'Error desconocido al reproducir.';
        }
      }
      
      setState(prev => ({ ...prev, error: errorMessage, isPlaying: false, isLoading: false }));
    };

    const handleVolumeChange = () => {
      setState(prev => ({ 
        ...prev, 
        volume: Math.round(audio.volume * 100),
        isMuted: audio.muted 
      }));
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('volumechange', handleVolumeChange);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('volumechange', handleVolumeChange);
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Actualizar URL del stream cuando cambie
  useEffect(() => {
    if (audioRef.current && streamUrl) {
      const wasPlaying = !audioRef.current.paused;
      audioRef.current.src = streamUrl;
      
      if (wasPlaying) {
        audioRef.current.play().catch(() => {
          setState(prev => ({ ...prev, isPlaying: false }));
        });
      }
    }
  }, [streamUrl]);

  const play = useCallback(async () => {
    if (!audioRef.current) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      await audioRef.current.play();
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        isPlaying: false, 
        isLoading: false,
        error: 'No se pudo iniciar la reproducción' 
      }));
    }
  }, []);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
  }, []);

  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, play, pause]);

  const setVolume = useCallback((volume: number) => {
    if (!audioRef.current) return;
    const clampedVolume = Math.max(0, Math.min(100, volume));
    audioRef.current.volume = clampedVolume / 100;
  }, []);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = !audioRef.current.muted;
  }, []);

  const setQuality = useCallback((quality: StreamQuality) => {
    setState(prev => ({ ...prev, quality }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    audioRef,
    state,
    play,
    pause,
    togglePlay,
    setVolume,
    toggleMute,
    setQuality,
    clearError,
  };
}
