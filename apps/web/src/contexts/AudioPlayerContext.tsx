import React, { createContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useAzuraCast, useAudioPlayer, useMediaSession, useSleepTimer, useFacebookLive } from '@/hooks';
import type { StreamQuality, NowPlayingData } from '@/types/azuracast';

// Import the specific return types for accurate typing
type AudioPlayerHookReturn = ReturnType<typeof useAudioPlayer>;
type SleepTimerReturn = ReturnType<typeof useSleepTimer>;
type SongRequestReturn = ReturnType<typeof useAzuraCast>['requestSong'];

export interface AudioPlayerContextType {
  data: NowPlayingData | null;
  isLoading: boolean;
  error: string | null;
  playerState: AudioPlayerHookReturn['state'];
  quality: StreamQuality;
  setQuality: (quality: StreamQuality) => void;
  togglePlay: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  clearError: () => void;
  reconnectAttempt: number;
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  liveUrl: string | null;
  sleepTimer: SleepTimerReturn;
  showRequests: boolean;
  setShowRequests: (show: boolean) => void;
  getStreamUrl: (quality: StreamQuality) => string;
  requestSong: SongRequestReturn;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const [showRequests, setShowRequests] = useState(false);
  const [quality, setQuality] = useState<StreamQuality>('128');
  const { liveUrl } = useFacebookLive();

  const { data, isLoading, error, getStreamUrl, requestSong } = useAzuraCast({
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    pollInterval: 15000,
  });

  const streamUrl = getStreamUrl(quality);

  const {
    analyserRef,
    state: playerState,
    togglePlay,
    setVolume,
    toggleMute,
    pause,
    setQuality: setPlayerQuality,
    clearError,
    reconnectAttempt,
  } = useAudioPlayer({ streamUrl, autoplay: true });

  const sleepTimer = useSleepTimer(pause);

  useMediaSession({
    title: data?.now_playing?.song?.title || 'Radio Stream',
    artist: data?.now_playing?.song?.artist || 'Desconocido',
    album: data?.now_playing?.song?.album || '',
    artwork: data?.now_playing?.song?.art || '',
    onPlay: togglePlay,
    onPause: togglePlay,
  });

  const handleSetQuality = useCallback((newQuality: StreamQuality) => {
    setQuality(newQuality);
    setPlayerQuality(newQuality);
  }, [setPlayerQuality, setQuality]);

  const value: AudioPlayerContextType = {
    data,
    isLoading,
    error: error ? String(error) : null,
    playerState,
    quality,
    setQuality: handleSetQuality,
    togglePlay,
    setVolume,
    toggleMute,
    clearError,
    reconnectAttempt,
    analyserRef,
    liveUrl,
    sleepTimer,
    showRequests,
    setShowRequests,
    getStreamUrl,
    requestSong
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}
