import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  fetchRequestableSongs as fetchRequestableSongsApi,
  fetchSchedule as fetchScheduleApi,
  fetchScheduleCategories as fetchScheduleCategoriesApi,
  requestSong as requestSongApi,
  rewriteLocalhostUrls,
  type SongRequestResult,
} from './api';
import type {
  NowPlayingData,
  SongRequest,
  StreamQuality,
  ScheduleItem,
  ScheduleCategorySummary,
} from '@radio/types';

export type { SongRequestResult } from './api';

export interface UseAzuraCastProps {
  apiBaseUrl?: string;
  pollInterval?: number;
  /**
   * When false, the realtime connection and polling are suspended (used on
   * mobile to close the socket while the app is backgrounded and paused).
   * Defaults to true.
   */
  enabled?: boolean;
}

export interface UseAzuraCastReturn {
  data: NowPlayingData | null;
  isLoading: boolean;
  error: string | null;
  requestSong: (requestId: string) => Promise<SongRequestResult>;
  fetchRequestableSongs: (options?: { page?: number; perPage?: number; search?: string }) => Promise<SongRequest[]>;
  fetchSchedule: () => Promise<ScheduleItem[] | null>;
  fetchScheduleCategories: () => Promise<ScheduleCategorySummary[] | null>;
  refresh: () => Promise<NowPlayingData | null | void>;
  getStreamUrl: (quality: StreamQuality) => string;
}

/**
 * Realtime AzuraCast now-playing data for a single station.
 *
 * Guideline: mount this hook in exactly one screen (the player). Each mount
 * opens its own SSE/WebSocket connection plus a polling fallback, so using it
 * in more than one screen duplicates connections and drains battery. If other
 * screens need the data, lift it into a shared context (same pattern as
 * FacebookLiveProvider) instead of calling the hook again.
 */
export function useAzuraCast({
  apiBaseUrl = '',
  pollInterval = 3000,
  enabled = true,
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
      let responseData = response.data;
      const urlBase = apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
      responseData = rewriteLocalhostUrls(responseData, urlBase);
      setData(responseData);
      setError(null);
      return responseData;
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
    if (!enabled) return;

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
            // Rewrite localhost URLs to avoid Mixed Content / CSP errors, only
            // when the payload actually contains them (production data does not).
            const raw = event.data;
            const rewritten = raw.includes("localhost") || raw.includes("127.0.0.1")
              ? raw.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g, baseUrl)
              : raw;

            const parsed = JSON.parse(rewritten);
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
            // Rewrite localhost URLs to avoid Mixed Content / CSP errors, only
            // when the payload actually contains them (production data does not).
            const raw = event.data;
            const rewritten = raw.includes("localhost") || raw.includes("127.0.0.1")
              ? raw.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g, baseUrl)
              : raw;

            const parsed = JSON.parse(rewritten);
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
        fallbackInterval = setInterval(fetchNowPlaying, Math.max(pollInterval, 60000));
      }
    });

    return () => {
      if (eventSource) eventSource.close();
      if (ws) ws.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [apiBaseUrl, enabled, fetchNowPlaying, pollInterval]);

  const requestSong = useCallback(
    (requestId: string) => requestSongApi(apiBaseUrl, requestId),
    [apiBaseUrl]
  );

  const fetchRequestableSongs = useCallback(
    (options: { page?: number; perPage?: number; search?: string } = {}) =>
      fetchRequestableSongsApi(apiBaseUrl, options),
    [apiBaseUrl]
  );

  const fetchSchedule = useCallback(
    () => fetchScheduleApi(apiBaseUrl),
    [apiBaseUrl]
  );

  const fetchScheduleCategories = useCallback(
    () => fetchScheduleCategoriesApi(apiBaseUrl),
    [apiBaseUrl]
  );

  const getStreamUrl = useCallback(
    (quality: StreamQuality): string => {
      if (!data?.station) return '';

      const mounts = data.station.mounts;
      const defaultMount = mounts.find((m) => m.is_default) || mounts[0];
      let streamUrl: string;

      if (defaultMount) {
        const qualityNum = parseInt(quality);
        const matchingMount = mounts.find((m) => m.bitrate === qualityNum);
        streamUrl = matchingMount ? matchingMount.url : defaultMount.url;
      } else {
        streamUrl = data.station.listen_url || '';
      }

      // Fix mixed content or localhost URLs coming natively from AzuraCast
      const baseUrl = apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
      streamUrl = rewriteLocalhostUrls(streamUrl, baseUrl);

      return streamUrl;
    },
    [data, apiBaseUrl]
  );

  return {
    data,
    isLoading,
    error,
    requestSong,
    fetchRequestableSongs,
    fetchSchedule,
    fetchScheduleCategories,
    refresh: fetchNowPlaying,
    getStreamUrl,
  };
}
