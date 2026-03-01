/**
 * Hook de audio para React Native usando expo-av.
 * Reemplaza el useAudioPlayer web (que depende de HTMLAudioElement).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';

interface UseAudioPlayerProps {
  streamUrl: string;
}

interface AudioPlayerState {
  isPlaying: boolean;
  isBuffering: boolean;
  error: string | null;
}

export function useAudioPlayer({ streamUrl }: UseAudioPlayerProps): AudioPlayerState & {
  toggle: () => Promise<void>;
  stop: () => Promise<void>;
} {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isBuffering: false,
    error: null,
  });

  // Configurar modo de audio al montar (permite audio en segundo plano)
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
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [streamUrl]);

  const toggle = useCallback(async () => {
    if (state.isPlaying) {
      // Parar y liberar (live stream: no pausar, para no mantener el buffer)
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setState((prev) => ({ ...prev, isPlaying: false, isBuffering: false }));
      return;
    }

    if (!streamUrl) return;

    setState((prev) => ({ ...prev, isBuffering: true, error: null }));

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: streamUrl },
        { shouldPlay: true, isLooping: false }
      );

      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          if (status.error) {
            setState({ isPlaying: false, isBuffering: false, error: 'Error al reproducir el stream' });
          }
          return;
        }
        setState({
          isPlaying: status.isPlaying,
          isBuffering: status.isBuffering,
          error: null,
        });
      });
    } catch {
      setState({ isPlaying: false, isBuffering: false, error: 'No se pudo conectar al stream' });
    }
  }, [streamUrl, state.isPlaying]);

  const stop = useCallback(async () => {
    await soundRef.current?.unloadAsync();
    soundRef.current = null;
    setState({ isPlaying: false, isBuffering: false, error: null });
  }, []);

  return { ...state, toggle, stop };
}
