import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type { NowPlayingData, SongRequest, StreamQuality } from '@radio/types';

export interface UseAzuraCastProps {
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
  fetchRequestableSongs: (options?: { page?: number; perPage?: number; search?: string }) => Promise<SongRequest[]>;
  refresh: () => Promise<NowPlayingData | null | void>;
  getStreamUrl: (quality: StreamQuality) => string;
}

export function useAzuraCast({
  apiBaseUrl = '',
  pollInterval = 3000,
}: UseAzuraCastProps): UseAzuraCastReturn {
  const [data, setData] = useState<NowPlayingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNowPlaying = useCallback(async (): Promise<NowPlayingData | null> => {
    try {
      const response = await axios.get<NowPlayingData>(`${apiBaseUrl}/api/nowplaying`, {
        timeout: 10000,
        headers: { Accept: 'application/json' },
      });
      setData(response.data);
      setError(null);
      return response.data;
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
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let ws: WebSocket | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const setupRealTime = (shortcode: string) => {
      let baseUrl = apiBaseUrl;
      if (!baseUrl && typeof window !== 'undefined') {
        baseUrl = window.location.origin;
      }
      
      const subs = { [`station:${shortcode}`]: {} };
      const cfConnectStr = encodeURIComponent(JSON.stringify({ subs }));

      if (typeof EventSource !== 'undefined') {
        const sseUrl = `${baseUrl}/api/live/nowplaying/sse?cf_connect=${cfConnectStr}`;
        eventSource = new EventSource(sseUrl);

        eventSource.onmessage = (event) => {
          if (!event.data) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed?.pub?.data?.np) {
              setData(parsed.pub.data.np);
              setIsLoading(false);
              setError(null);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        };

        eventSource.onerror = () => {
          eventSource?.close();
          fetchNowPlaying();
          
          if (!fallbackInterval) {
            fallbackInterval = setInterval(fetchNowPlaying, pollInterval);
          }
          
          reconnectTimeout = setTimeout(() => {
            if (fallbackInterval) {
              clearInterval(fallbackInterval);
              fallbackInterval = null;
            }
            setupRealTime(shortcode);
          }, 5000);
        };
      } else if (typeof WebSocket !== 'undefined') {
        const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
        const hostPath = baseUrl.replace(/^https?:\/\//, '') || 'localhost:3000';
        const wsUrl = `${wsProtocol}://${hostPath}/api/live/nowplaying/websocket`;
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          ws?.send(JSON.stringify({ subs }));
        };

        ws.onmessage = (event) => {
          if (!event.data) return;
          try {
            const parsed = JSON.parse(event.data);
            if (parsed?.pub?.data?.np) {
              setData(parsed.pub.data.np);
              setIsLoading(false);
              setError(null);
            }
          } catch (e) {
            console.error('Error parsing WS data:', e);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };

        ws.onclose = () => {
          fetchNowPlaying();
          
          if (!fallbackInterval) {
            fallbackInterval = setInterval(fetchNowPlaying, pollInterval);
          }
          
          reconnectTimeout = setTimeout(() => {
            if (fallbackInterval) {
              clearInterval(fallbackInterval);
              fallbackInterval = null;
            }
            setupRealTime(shortcode);
          }, 5000);
        };
      } else {
        fallbackInterval = setInterval(fetchNowPlaying, pollInterval);
      }
    };

    fetchNowPlaying().then((initialData) => {
      if (initialData?.station?.shortcode) {
        setupRealTime(initialData.station.shortcode);
      } else {
        fallbackInterval = setInterval(fetchNowPlaying, pollInterval);
      }
    });

    return () => {
      if (eventSource) eventSource.close();
      if (ws) ws.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [apiBaseUrl, fetchNowPlaying, pollInterval]);

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
    async ({ page = 1, perPage = 25, search = '' } = {}): Promise<SongRequest[]> => {
      const params: Record<string, string> = {
        page: String(page),
        per_page: String(perPage),
      };
      if (search.trim()) params.search = search.trim();

      const response = await axios.get(`${apiBaseUrl}/api/search`, {
        params,
        timeout: 10000,
        headers: { Accept: 'application/json' },
      });

      const data = response.data;
      return Array.isArray(data) ? data : (data.result ?? data.rows ?? data.data ?? []);
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
