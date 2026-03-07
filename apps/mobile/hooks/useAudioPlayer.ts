/**
 * Hook de audio para React Native usando react-native-track-player.
 * Incluye reconexión automática con backoff exponencial y foreground
 * service en Android para reproducción en segundo plano.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
  usePlaybackState,
} from 'react-native-track-player';

// Backoff: 2s, 4s, 8s, 16s, 30s (máx)
const RECONNECT_DELAYS = [2000, 4000, 8000, 16000, 30000];

interface UseAudioPlayerProps {
  streamUrl: string;
}

interface AudioPlayerState {
  isPlaying: boolean;
  isBuffering: boolean;
  error: string | null;
  reconnectAttempt: number;
}

async function configureTrackPlayer(): Promise<void> {
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
    capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
    compactCapabilities: [Capability.Play, Capability.Pause],
  });
}

export function useAudioPlayer({ streamUrl }: UseAudioPlayerProps): AudioPlayerState & {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  toggle: () => Promise<void>;
  stop: () => Promise<void>;
} {
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRef = useRef(false);
  const streamUrlRef = useRef(streamUrl);
  streamUrlRef.current = streamUrl;

  const playbackState = usePlaybackState();
  const rnState = playbackState.state;

  const isPlaying = rnState === State.Playing;
  const isBuffering =
    rnState === State.Buffering ||
    rnState === State.Loading ||
    rnState === State.Connecting;

  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    // setupPlayer returns true only on first call, false if already set up
    TrackPlayer.setupPlayer({ autoHandleInterruptions: true })
      .then(() => configureTrackPlayer())
      .catch(() => {
        // Already set up — just re-apply options
        configureTrackPlayer();
      });

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  // Listen for playback errors and schedule reconnect
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackError, () => {
      if (!wasPlayingRef.current) return;
      if (retryTimerRef.current) return;

      const attempt = retryRef.current;
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      retryRef.current += 1;
      const nextAttempt = retryRef.current;

      setError(`Stream interrumpido. Reconectando… (intento ${nextAttempt})`);
      setReconnectAttempt(nextAttempt);

      retryTimerRef.current = setTimeout(async () => {
        retryTimerRef.current = null;
        if (!wasPlayingRef.current) return;
        try {
          await TrackPlayer.reset();
          await TrackPlayer.add({
            url: streamUrlRef.current,
            title: 'La Voz de la Verdad',
            artist: 'En Vivo',
            isLiveStream: true,
          });
          await TrackPlayer.play();
        } catch {
          // Will trigger another PlaybackError → next backoff round
        }
      }, delay);
    });

    // Reset error when playback succeeds
    const playingSubscription = TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
      if (state === State.Playing) {
        retryRef.current = 0;
        setError(null);
        setReconnectAttempt(0);
      }
    });

    return () => {
      subscription.remove();
      playingSubscription.remove();
    };
  }, []);

  const play = useCallback(async () => {
    if (!streamUrl) return;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    wasPlayingRef.current = true;
    retryRef.current = 0;
    setError(null);
    setReconnectAttempt(0);

    try {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        url: streamUrlRef.current,
        title: 'La Voz de la Verdad',
        artist: 'En Vivo',
        isLiveStream: true,
      });
      await TrackPlayer.play();
    } catch {
      wasPlayingRef.current = false;
      setError('No se pudo iniciar la reproducción');
    }
  }, [streamUrl]);

  const pause = useCallback(async () => {
    wasPlayingRef.current = false;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryRef.current = 0;
    // For live streams: reset completely instead of pausing
    await TrackPlayer.reset();
    setError(null);
    setReconnectAttempt(0);
  }, []);

  const toggle = useCallback(async () => {
    if (isPlaying || isBuffering) {
      await pause();
    } else {
      await play();
    }
  }, [isPlaying, isBuffering, play, pause]);

  const stop = useCallback(async () => {
    await pause();
  }, [pause]);

  return { isPlaying, isBuffering, error, reconnectAttempt, play, pause, toggle, stop };
}

