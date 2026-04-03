import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { NowPlayingData, SongRequest, StreamQuality, ScheduleItem } from '@radio/types';

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
  fetchSchedule: () => Promise<ScheduleItem[] | null>;
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
    let retryCount = 0;
    const RECONNECT_DELAYS = [5000, 10000, 15000, 30000, 60000];

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

        eventSource.onopen = () => {
          retryCount = 0;
        };

        eventSource.onmessage = (event) => {
          if (!event.data) return;
          try {
            // Rewrite localhost URLs to avoid Mixed Content / CSP errors
            const rewrittenData = event.data
              .replace(/http:\/\/localhost/g, baseUrl)
              .replace(/https:\/\/localhost/g, baseUrl);
              
            const parsed = JSON.parse(rewrittenData);
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
            fallbackInterval = setInterval(fetchNowPlaying, Math.max(pollInterval, 10000));
          }
          
          const delay = RECONNECT_DELAYS[Math.min(retryCount++, RECONNECT_DELAYS.length - 1)];
          reconnectTimeout = setTimeout(() => {
            if (fallbackInterval) {
              clearInterval(fallbackInterval);
              fallbackInterval = null;
            }
            setupRealTime(shortcode);
          }, delay);
        };
      } else if (typeof WebSocket !== 'undefined') {
        const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
        const hostPath = baseUrl.replace(/^https?:\/\//, '') || 'localhost:3000';
        const wsUrl = `${wsProtocol}://${hostPath}/api/live/nowplaying/websocket`;
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          retryCount = 0;
          ws?.send(JSON.stringify({ subs }));
        };

        ws.onmessage = (event) => {
          if (!event.data) return;
          try {
            // Rewrite localhost URLs to avoid Mixed Content / CSP errors
            const rewrittenData = event.data
              .replace(/http:\/\/localhost/g, baseUrl)
              .replace(/https:\/\/localhost/g, baseUrl);

            const parsed = JSON.parse(rewrittenData);
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
            fallbackInterval = setInterval(fetchNowPlaying, Math.max(pollInterval, 10000));
          }
          
          const delay = RECONNECT_DELAYS[Math.min(retryCount++, RECONNECT_DELAYS.length - 1)];
          reconnectTimeout = setTimeout(() => {
            if (fallbackInterval) {
              clearInterval(fallbackInterval);
              fallbackInterval = null;
            }
            setupRealTime(shortcode);
          }, delay);
        };
      } else {
        fallbackInterval = setInterval(fetchNowPlaying, Math.max(pollInterval, 10000));
      }
    };

    fetchNowPlaying().then((initialData) => {
      if (initialData?.station?.shortcode) {
        setupRealTime(initialData.station.shortcode);
      } else {
        fallbackInterval = setInterval(fetchNowPlaying, Math.max(pollInterval, 10000));
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

  const fetchSchedule = useCallback(
    async (): Promise<ScheduleItem[] | null> => {
      try {
        const response = await axios.get(`${apiBaseUrl}/api/schedule`, {
          timeout: 10000,
          headers: { Accept: 'application/json' },
        });
        const data = response.data;
        return Array.isArray(data) ? data : (data.result ?? data.rows ?? data.data ?? null);
      } catch {
        return null;
      }
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
    fetchSchedule,
    refresh: fetchNowPlaying,
    getStreamUrl,
  };
}
