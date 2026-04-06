import { useState, useRef, useCallback, useEffect } from 'react';
import type { StreamQuality, PlayerState } from '@/types/azuracast';

interface UseAudioPlayerProps {
  streamUrl: string;
  autoplay?: boolean;
}

const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

export function useAudioPlayer({ streamUrl, autoplay = true }: UseAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  if (typeof window !== 'undefined' && !audioRef.current) {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'none';
    audioRef.current = audio;
  }

  const streamUrlRef = useRef(streamUrl);
  streamUrlRef.current = streamUrl;

  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRef = useRef(true);

  const [state, setState] = useState<PlayerState>({
    isPlaying: false,
    isMuted: false,
    requiresUserGesture: false,
    volume: 80,
    quality: '128',
    isLive: false,
    isLoading: false,
    error: null,
  });
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    const audio = audioRef.current!;

    const handlePlay = () => {
      retryRef.current = 0;
      setReconnectAttempt(0);
      setState(prev => ({ ...prev, isPlaying: true, isLoading: false, error: null, requiresUserGesture: false }));
    };

    const handlePause = () => {
      wasPlayingRef.current = false;
      setState(prev => ({ ...prev, isPlaying: false }));
    };

    const handleWaiting = () => {
      setState(prev => ({ ...prev, isLoading: true }));
    };

    const handleCanPlay = () => {
      setState(prev => ({ ...prev, isLoading: false }));
    };

    const handleStalled = () => {
      if (wasPlayingRef.current) {
        scheduleReconnect('El stream se interrumpió. Reconectando…');
      }
    };

    const scheduleReconnect = (msg: string) => {
      if (retryTimerRef.current) return; 
      const attempt = retryRef.current;
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      retryRef.current += 1;
      setReconnectAttempt(retryRef.current);
      setState(prev => ({ ...prev, error: `${msg} (intento ${retryRef.current})`, isLoading: true }));

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        const audio = audioRef.current;
        if (!audio || !wasPlayingRef.current) return;
        const base = streamUrlRef.current.split('?')[0];
        audio.src = `${base}?_r=${Date.now()}`;
        audio.play().catch(() => {
          scheduleReconnect('No se pudo reconectar.');
        });
      }, delay);
    };

    const handleError = (e: Event) => {
      const target = e.target as HTMLAudioElement;

      if (!target.src || target.src === window.location.href) return;

      let errorMessage = 'Error al reproducir el stream';

      if (target.error) {
        switch (target.error.code) {
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Error de red';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Error al decodificar el audio';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Formato de audio no soportado';
            break;
          default:
            errorMessage = 'Error desconocido al reproducir';
        }
      }

      if (wasPlayingRef.current) {
        scheduleReconnect(errorMessage + '. Reconectando…');
      } else {
        setState(prev => ({ ...prev, error: errorMessage, isPlaying: false, isLoading: false }));
      }
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
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('error', handleError);
    audio.addEventListener('volumechange', handleVolumeChange);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('volumechange', handleVolumeChange);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      audio.pause();
      audio.src = '';
    };
  }, []);

  const resumeAudioContext = useCallback(async () => {
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume().catch(() => {});
    }
  }, []);

  const initAudioGraphIfNeeded = useCallback(() => {
    if (audioContextRef.current || !audioRef.current || typeof window === 'undefined') return;
    try {
      const AudioContextCtor = window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
    } catch { /* Safari may fail silently; audio still works without visualiser */ }
  }, []);

  const play = useCallback(async () => {
    if (!audioRef.current) return;
    initAudioGraphIfNeeded();
    await resumeAudioContext();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    wasPlayingRef.current = true;
    setState(prev => ({ ...prev, isLoading: true, isPlaying: false, error: null, requiresUserGesture: false }));
    audioRef.current.src = streamUrlRef.current;
    try {
      await audioRef.current.play();
      setState(prev => ({ ...prev, isPlaying: true, isLoading: false }));
    } catch {
      wasPlayingRef.current = false;
      setState(prev => ({
        ...prev,
        isPlaying: false,
        isLoading: false,
        error: 'No se pudo iniciar la reproducción',
      }));
    }
  }, [resumeAudioContext, initAudioGraphIfNeeded]);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    wasPlayingRef.current = false;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryRef.current = 0;
    setReconnectAttempt(0);
    setState(prev => ({ ...prev, isPlaying: false, isLoading: false }));
    audioRef.current.pause();
    audioRef.current.src = '';
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

  // Attempt autoplay on mount. The AudioContext is deliberately NOT involved here
  // so the browser evaluates its native autoplay policy independently.
  // If blocked (NotAllowedError) the UI shows a clear "tap to play" overlay.
  useEffect(() => {
    if (!autoplay) return;
    const audio = audioRef.current;
    if (!audio) return;

    const tryAutoplay = async () => {
      wasPlayingRef.current = true;
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      audio.src = streamUrlRef.current;
      try {
        await audio.play();
        initAudioGraphIfNeeded();
        
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          wasPlayingRef.current = false;
          audio.pause();
          audio.src = '';
          setState(prev => ({
            ...prev,
            isPlaying: false,
            isLoading: false,
            requiresUserGesture: true,
          }));
        }
      } catch (err) {
        wasPlayingRef.current = false;
        const blocked = err instanceof DOMException && err.name === 'NotAllowedError';
        setState(prev => ({
          ...prev,
          isLoading: false,
          requiresUserGesture: blocked,
        }));
        audio.src = '';
      }
    };

    tryAutoplay();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setQuality = useCallback((quality: StreamQuality) => {
    setState(prev => ({ ...prev, quality }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    audioRef,
    analyserRef,
    state,
    reconnectAttempt,
    play,
    pause,
    togglePlay,
    setVolume,
    toggleMute,
    setQuality,
    clearError,
  };
}
