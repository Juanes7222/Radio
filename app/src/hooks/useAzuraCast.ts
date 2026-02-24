import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type { NowPlayingData, SongHistory, StreamQuality } from '@/types/azuracast';

interface UseAzuraCastProps {
  stationUrl: string;
  pollInterval?: number;
}

interface UseAzuraCastReturn {
  data: NowPlayingData | null;
  isLoading: boolean;
  error: string | null;
  history: SongHistory[];
  requestSong: (songId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  getStreamUrl: (quality: StreamQuality) => string;
}

export function useAzuraCast({ 
  stationUrl, 
  pollInterval = 15000 
}: UseAzuraCastProps): UseAzuraCastReturn {
  const [data, setData] = useState<NowPlayingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const apiUrl = `${stationUrl}/api/nowplaying`;
      const response = await axios.get<NowPlayingData>(apiUrl, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
        },
      });

      setData(response.data);
      setError(null);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNABORTED') {
          setError('Tiempo de espera agotado. Verifica la URL de la estación.');
        } else if (err.response?.status === 404) {
          setError('Estación no encontrada. Verifica la URL.');
        } else {
          setError('Error al conectar con el servidor de radio.');
        }
      } else {
        setError('Error desconocido al obtener datos.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [stationUrl]);

  // Polling automático
  useEffect(() => {
    fetchNowPlaying();
    
    intervalRef.current = setInterval(fetchNowPlaying, pollInterval);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchNowPlaying, pollInterval]);

  // Request de canción
  const requestSong = useCallback(async (songId: string): Promise<boolean> => {
    try {
      const requestUrl = `${stationUrl}/api/station/1/request/${songId}`;
      await axios.post(requestUrl);
      return true;
    } catch (err) {
      console.error('Error requesting song:', err);
      return false;
    }
  }, [stationUrl]);

  // Obtener URL del stream según calidad
  const getStreamUrl = useCallback((quality: StreamQuality): string => {
    if (!data?.station) return '';
    
    const mounts = data.station.mounts;
    const defaultMount = mounts.find(m => m.is_default) || mounts[0];
    
    if (!defaultMount) return '';
    
    // Si hay múltiples mounts con diferentes bitrates, buscar el que coincida
    const qualityNum = parseInt(quality);
    const matchingMount = mounts.find(m => m.bitrate === qualityNum);
    
    if (matchingMount) {
      return matchingMount.url;
    }
    
    // Fallback al mount por defecto
    return defaultMount.url;
  }, [data]);

  return {
    data,
    isLoading,
    error,
    history: data?.song_history || [],
    requestSong,
    refresh: fetchNowPlaying,
    getStreamUrl,
  };
}
