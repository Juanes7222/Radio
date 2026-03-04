/**
 * Hook de audio para React Native usando expo-av.
 * Incluye reconexión automática con backoff exponencial.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Audio, type AVPlaybackStatus } from 'expo-av';

interface UseAudioPlayerProps {
  streamUrl: string;
}

interface AudioPlayerState {
  isPlaying: boolean;
  isBuffering: boolean;
  error: string | null;
  reconnectAttempt: number;
}

// Backoff: 2s, 4s, 8s, 16s, 30s (máx)
const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

export function useAudioPlayer({ streamUrl }: UseAudioPlayerProps): AudioPlayerState & {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  toggle: () => Promise<void>;
  stop: () => Promise<void>;
} {
  const soundRef = useRef<Audio.Sound | null>(null);
  const wasPlayingRef = useRef(false);
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamUrlRef = useRef(streamUrl);
  streamUrlRef.current = streamUrl;

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isBuffering: false,
    error: null,
    reconnectAttempt: 0,
  });

  // Configurar modo de audio al montar (permite audio en segundo plano en iOS/Android)
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }, []);

  // Limpiar cuando cambia la URL o se desmonta
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [streamUrl]);

  const scheduleReconnect = useCallback((msg: string) => {
    if (retryTimerRef.current) return; // ya hay un reintento pendiente
    const attempt = retryRef.current;
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
    retryRef.current += 1;
    const nextAttempt = retryRef.current;

    setState(prev => ({
      ...prev,
      error: `${msg} (intento ${nextAttempt})`,
      isBuffering: true,
      reconnectAttempt: nextAttempt,
    }));

    retryTimerRef.current = setTimeout(async () => {
      retryTimerRef.current = null;
      if (!wasPlayingRef.current) return;

      try {
        // Descargar el sonido anterior si existe
        await soundRef.current?.unloadAsync();
        soundRef.current = null;

        const { sound } = await Audio.Sound.createAsync(
          { uri: streamUrlRef.current },
          { shouldPlay: true }
        );

        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate(onStatusUpdate);
      } catch {
        scheduleReconnect('No se pudo reconectar.');
      }
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        if (wasPlayingRef.current) {
          scheduleReconnect('El stream se interrumpió. Reconectando…');
        } else {
          setState(prev => ({ ...prev, isPlaying: false, isBuffering: false, error: 'Error al reproducir el stream' }));
        }
      }
      return;
    }

    // Reproducción OK → resetear contador de reintentos
    if (status.isPlaying) {
      retryRef.current = 0;
      setState({ isPlaying: true, isBuffering: false, error: null, reconnectAttempt: 0 });
    } else {
      setState(prev => ({ ...prev, isPlaying: status.isPlaying, isBuffering: status.isBuffering ?? false }));
    }
  }, [scheduleReconnect]);

  const play = useCallback(async () => {
    if (!streamUrl) return;

    // Cancelar reintento pendiente si el usuario pulsa play manualmente
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    wasPlayingRef.current = true;
    retryRef.current = 0;
    setState(prev => ({ ...prev, isBuffering: true, error: null, reconnectAttempt: 0 }));

    try {
      await soundRef.current?.unloadAsync();
      soundRef.current = null;

      const { sound } = await Audio.Sound.createAsync(
        { uri: streamUrlRef.current },
        { shouldPlay: true }
      );

      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate(onStatusUpdate);
    } catch {
      wasPlayingRef.current = false;
      setState(prev => ({ ...prev, isPlaying: false, isBuffering: false, error: 'No se pudo iniciar la reproducción' }));
    }
  }, [streamUrl, onStatusUpdate]);

  const pause = useCallback(async () => {
    wasPlayingRef.current = false;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryRef.current = 0;
    // Para streams en vivo: liberar completamente, no solo pausar
    await soundRef.current?.unloadAsync();
    soundRef.current = null;
    setState({ isPlaying: false, isBuffering: false, error: null, reconnectAttempt: 0 });
  }, []);

  const toggle = useCallback(async () => {
    if (state.isPlaying || state.isBuffering) {
      await pause();
    } else {
      await play();
    }
  }, [state.isPlaying, state.isBuffering, play, pause]);

  const stop = useCallback(async () => {
    await pause();
  }, [pause]);

  return { ...state, play, pause, toggle, stop };
}


interface UseAudioPlayerProps {
  streamUrl: string;
}

interface AudioPlayerState {
  isPlaying: boolean;
  isBuffering: boolean;
  error: string | null;
}

