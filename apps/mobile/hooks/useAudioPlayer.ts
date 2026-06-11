/**
 * React Native audio hook using react-native-track-player.
 * Implements exponential backoff reconnection and shields
 * the event listener during manual transitions to prevent
 * phantom error loops.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  State,
  usePlaybackState,
} from 'react-native-track-player';

const RECONNECT_DELAYS = [3000, 5000, 10000, 20000, 30000];
const STREAM_STABLE_MS = 8000;

interface UseAudioPlayerProps {
  streamUrl: string;
  title?: string;
  artist?: string;
  artwork?: string | null;
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

export function useAudioPlayer({ streamUrl, title, artist, artwork }: UseAudioPlayerProps): AudioPlayerState & {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  toggle: () => Promise<void>;
  stop: () => Promise<void>;
} {
  const retryRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRef = useRef(false);
  const lastSrcChangeRef = useRef(0);

  const streamUrlRef = useRef(streamUrl);
  streamUrlRef.current = streamUrl;

  const infoRef = useRef({ title, artist, artwork });
  infoRef.current = { title, artist, artwork };

  const playbackState = usePlaybackState();
  const rnState = playbackState.state;

  const isPlaying = rnState === State.Playing;
  const isBuffering =
    rnState === State.Buffering ||
    (rnState as unknown as string) === 'loading' ||
    (rnState as unknown as string) === 'connecting';

  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    if (!isPlaying) return;

    TrackPlayer.updateNowPlayingMetadata({
      title: infoRef.current.title || 'La Voz de la Verdad',
      artist: infoRef.current.artist || 'En Vivo',
      artwork: infoRef.current.artwork || undefined,
    }).catch(() => {
      // Silent catch for unready player state
    });
  }, [title, artist, artwork, isPlaying]);

  useEffect(() => {
    TrackPlayer.setupPlayer({ autoHandleInterruptions: true })
      .then(() => configureTrackPlayer())
      .catch(() => configureTrackPlayer());

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const isStreamStable = () => {
      return Date.now() - lastSrcChangeRef.current > STREAM_STABLE_MS;
    };

    const scheduleReconnect = (msg: string) => {
      if (retryTimerRef.current) return;
      const attempt = retryRef.current;
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      retryRef.current += 1;
      const nextAttempt = retryRef.current;

      setError(`${msg} (intento ${nextAttempt})`);
      setReconnectAttempt(nextAttempt);

      retryTimerRef.current = setTimeout(async () => {
        retryTimerRef.current = null;
        if (!wasPlayingRef.current) return;

        try {
          lastSrcChangeRef.current = Date.now();
          await TrackPlayer.reset();
          await TrackPlayer.add({
            url: streamUrlRef.current,
            title: infoRef.current.title || 'La Voz de la Verdad',
            artist: infoRef.current.artist || 'En Vivo',
            artwork: infoRef.current.artwork || undefined,
            isLiveStream: true,
          });
          await TrackPlayer.play();
        } catch (err) {
          // Defer to next error event
        }
      }, delay);
    };

    const errorSubscription = TrackPlayer.addEventListener(Event.PlaybackError, () => {
      if (!wasPlayingRef.current) return;
      if (!isStreamStable()) return;
      if (retryTimerRef.current) return;
      scheduleReconnect('Stream interrumpido. Reconectando');
    });

    const stateSubscription = TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
      if (state === State.Playing) {
        retryRef.current = 0;
        setError(null);
        setReconnectAttempt(0);
      }
    });

    return () => {
      errorSubscription.remove();
      stateSubscription.remove();
    };
  }, []);

  const play = useCallback(async () => {
    if (!streamUrl) return;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    lastSrcChangeRef.current = Date.now();
    wasPlayingRef.current = true;
    retryRef.current = 0;
    setError(null);
    setReconnectAttempt(0);

    try {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        url: streamUrlRef.current,
        title: infoRef.current.title || 'La Voz de la Verdad',
        artist: infoRef.current.artist || 'En Vivo',
        artwork: infoRef.current.artwork || undefined,
        isLiveStream: true,
      });


      await TrackPlayer.play();
    } catch (err) {
      wasPlayingRef.current = false;
      setError('Playback initiation failed');
    }
  }, [streamUrl]);

  const pause = useCallback(async () => {
    lastSrcChangeRef.current = Date.now();
    wasPlayingRef.current = false;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    retryRef.current = 0;
    setError(null);
    setReconnectAttempt(0);

    try {
      await TrackPlayer.stop();
    } catch {
      // Silent catch for stop errors
    }
  }, []);

  const toggle = useCallback(async () => {
    if (wasPlayingRef.current) {
      await pause();
    } else {
      await play();
    }
  }, [play, pause]);

  const stop = useCallback(async () => {
    await pause();
  }, [pause]);

  return { isPlaying, isBuffering, error, reconnectAttempt, play, pause, toggle, stop };
}