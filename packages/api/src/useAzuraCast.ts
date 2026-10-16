import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  fetchRequestableSongs as fetchRequestableSongsApi,
  fetchSchedule as fetchScheduleApi,
  fetchScheduleCategories as fetchScheduleCategoriesApi,
  requestSong as requestSongApi,
  rewriteLocalhostUrls,
  toSameOriginMediaUrls,
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

/** Shape of the realtime now-playing envelope pushed by AzuraCast over SSE and WS. */
type RealtimeEnvelope = { pub?: { data?: { np?: NowPlayingData } } };

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
      responseData = toSameOriginMediaUrls(rewriteLocalhostUrls(responseData, urlBase), urlBase);
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
    let idleTimer: ReturnType<typeof setInterval> | null = null;
    let retryCount = 0;
    let activeShortcode: string | null = null;
    let lastDataAt = Date.now();
    const RECONNECT_DELAYS = [5000, 10000, 15000, 30000, 60000];
    // A transport that stays open but stops emitting is indistinguishable from a
    // healthy one to every error path, so silence retires it on its own. The
    // bound is generous on purpose: the station only pushes when now-playing
    // changes, and a long track must not read as a dead stream. The cost of a
    // false positive is one reconnect, never a wrong frame.
    const IDLE_TIMEOUT_MS = 90_000;
    const IDLE_CHECK_INTERVAL_MS = 15_000;

    const markDataReceived = () => {
      lastDataAt = Date.now();
    };

    const fetchAndMark = async (): Promise<NowPlayingData | null> => {
      const fresh = await fetchNowPlaying();
      if (fresh) markDataReceived();
      return fresh;
    };

    const setupRealTime = (shortcode: string) => {
      // Re-entry guard. Both a reconnect timer and a slow-poll upgrade can reach
      // this function, so teardown of the previous transport belongs here rather
      // than being duplicated at each call site.
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }

      let baseUrl = apiBaseUrl;
      if (!baseUrl && typeof window !== 'undefined') {
        baseUrl = window.location.origin;
      }
      
      const subs = { [`station:${shortcode}`]: {} };
      const cfConnectStr = encodeURIComponent(JSON.stringify({ subs }));

      if (typeof EventSource !== 'undefined') {
        const sseUrl = `${baseUrl}/api/live/nowplaying/sse?cf_connect=${cfConnectStr}`;
        eventSource = new EventSource(sseUrl);

        // Handlers go through addEventListener rather than the onopen/onmessage/
        // onerror properties. React Native has no native EventSource, so mobile
        // polyfills it with react-native-sse, whose class only exposes the
        // listener API; assigning the properties creates inert fields that the
        // library never reads, which left the stream silently delivering nothing
        // and froze the screen on its first payload.
        eventSource.addEventListener('open', () => {
          retryCount = 0;
        });

        eventSource.addEventListener('message', (event) => {
          if (!event.data) return;
          try {
            // Rewrite localhost URLs to avoid Mixed Content / CSP errors, only
            // when the payload actually contains them (production data does not).
            const raw = event.data;
            const rewritten = raw.includes("localhost") || raw.includes("127.0.0.1")
              ? raw.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g, baseUrl)
              : raw;

            const parsed = toSameOriginMediaUrls<RealtimeEnvelope>(JSON.parse(rewritten), baseUrl);
            if (parsed?.pub?.data?.np) {
              markDataReceived();
              setData(parsed.pub.data.np);
              setIsLoading(false);
              setError(null);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        });

        eventSource.addEventListener('error', () => {
          recoverTransport();
        });
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

            const parsed = toSameOriginMediaUrls<RealtimeEnvelope>(JSON.parse(rewritten), baseUrl);
            if (parsed?.pub?.data?.np) {
              markDataReceived();
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
          recoverTransport();
        };
      } else {
        fallbackInterval = setInterval(fetchAndMark, Math.max(pollInterval, 10000));
      }
    };

    /**
     * Single recovery path for every way the realtime transport can go away:
     * a reported error, a closed socket, or a stream that simply stops
     * emitting. Keeping them identical is what stops one of the paths from
     * leaving the screen frozen while the others recover.
     */
    const recoverTransport = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }

      void fetchAndMark();

      if (!fallbackInterval) {
        fallbackInterval = setInterval(fetchAndMark, Math.max(pollInterval, 10000));
      }

      const shortcode = activeShortcode;
      if (!shortcode) return;
      const delay = RECONNECT_DELAYS[Math.min(retryCount++, RECONNECT_DELAYS.length - 1)];
      reconnectTimeout = setTimeout(() => setupRealTime(shortcode), delay);
    };

    // Silence is a failure mode of its own: nothing errors, nothing arrives, and
    // the player keeps rendering a stale song until the app is restarted.
    idleTimer = setInterval(() => {
      if (Date.now() - lastDataAt < IDLE_TIMEOUT_MS) return;
      // Reset before recovering so the next tick cannot re-enter while the
      // reconnect is still pending.
      markDataReceived();
      recoverTransport();
    }, IDLE_CHECK_INTERVAL_MS);

    fetchAndMark().then((initialData) => {
      if (initialData?.station?.shortcode) {
        activeShortcode = initialData.station.shortcode;
        setupRealTime(activeShortcode);
        return;
      }

      // Cold start on a slow or flaky network. Poll slowly, and upgrade to the
      // realtime connection the moment the station answers. Without the upgrade
      // a bad first request pins the whole session to the coarse interval, so
      // now-playing would stay 60s stale even after the network recovered.
      fallbackInterval = setInterval(() => {
        void fetchAndMark().then((fresh) => {
          if (fresh?.station?.shortcode) {
            activeShortcode = fresh.station.shortcode;
            setupRealTime(activeShortcode);
          }
        });
      }, Math.max(pollInterval, 60000));
    });

    return () => {
      if (eventSource) eventSource.close();
      if (ws) ws.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (idleTimer) clearInterval(idleTimer);
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
