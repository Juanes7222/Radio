import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type { NowPlayingData, SongRequest, StreamQuality } from '@radio/types';

export interface UseAzuraCastProps {
  /** Backend base URL. Empty string uses relative paths (same-origin web). */
  apiBaseUrl?: string;
  pollInterval?: number;
}

export type SongRequestResult =
  | { success: true }
  | { success: false; errorMessage: string };

export interface UseAzuraCastReturn {
  data: NowPlayingData | null;
  isLoading: boolean;
  error: string | null;
  requestSong: (requestId: string) => Promise<SongRequestResult>;
  fetchRequestableSongs: (searchQuery?: string) => Promise<SongRequest[]>;
  refresh: () => Promise<void>;
  getStreamUrl: (quality: StreamQuality) => string;
}

export function useAzuraCast({
  apiBaseUrl = '',
  pollInterval = 15000,
}: UseAzuraCastProps): UseAzuraCastReturn {
  const [data, setData] = useState<NowPlayingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const response = await axios.get<NowPlayingData>(`${apiBaseUrl}/api/nowplaying`, {
        timeout: 10000,
        headers: { Accept: 'application/json' },
      });
      setData(response.data);
      setError(null);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNABORTED') {
          setError('Tiempo de espera agotado. Verifica la conexión.');
        } else if (err.response?.status === 404) {
          setError('Estación no encontrada.');
        } else {
          setError('Error al conectar con el servidor de radio.');
        }
      } else {
        setError('Error desconocido al obtener datos.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    fetchNowPlaying();
    intervalRef.current = setInterval(fetchNowPlaying, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNowPlaying, pollInterval]);

  const requestSong = useCallback(
    async (requestId: string): Promise<SongRequestResult> => {
      try {
        await axios.post(`${apiBaseUrl}/api/requests/${requestId}`);
        return { success: true };
      } catch (err) {
        if (axios.isAxiosError(err)) {
          const serverMessage: string | undefined =
            err.response?.data?.message ?? err.response?.data?.error;
          if (serverMessage) return { success: false, errorMessage: serverMessage };
          if (err.code === 'ECONNABORTED')
            return { success: false, errorMessage: 'Tiempo de espera agotado.' };
        }
        return { success: false, errorMessage: 'No se pudo solicitar la canción.' };
      }
    },
    [apiBaseUrl]
  );

  const fetchRequestableSongs = useCallback(
    async (searchQuery = ''): Promise<SongRequest[]> => {
      const params = searchQuery.trim() ? { search: searchQuery.trim() } : {};
      const response = await axios.get<SongRequest[]>(`${apiBaseUrl}/api/search`, {
        params,
        timeout: 10000,
        headers: { Accept: 'application/json' },
      });
      return response.data;
    },
    [apiBaseUrl]
  );

  const getStreamUrl = useCallback(
    (quality: StreamQuality): string => {
      if (!data?.station) return '';
      const mounts = data.station.mounts;
      const defaultMount = mounts.find((m) => m.is_default) || mounts[0];
      if (!defaultMount) return '';
      const qualityNum = parseInt(quality);
      const matchingMount = mounts.find((m) => m.bitrate === qualityNum);
      return matchingMount ? matchingMount.url : defaultMount.url;
    },
    [data]
  );

  return {
    data,
    isLoading,
    error,
    requestSong,
    fetchRequestableSongs,
    refresh: fetchNowPlaying,
    getStreamUrl,
  };
}
