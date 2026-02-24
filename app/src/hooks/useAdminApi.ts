import { useCallback } from 'react';
import axios, { type AxiosRequestConfig } from 'axios';
import { useAdminAuth } from '@/hooks/useAdminAuth';

const STATION_URL = import.meta.env.VITE_STATION_URL || '';

export function useAdminApi() {
  const { apiKey, user } = useAdminAuth();
  const stationId = user?.stationId ?? import.meta.env.VITE_STATION_ID;

  const request = useCallback(
    async <T>(config: AxiosRequestConfig): Promise<T> => {
      const res = await axios<T>({
        ...config,
        baseURL: STATION_URL,
        headers: {
          ...(config.headers ?? {}),
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: config.timeout ?? 10000,
      });
      return res.data;
    },
    [apiKey]
  );

  // ── Estadísticas ────────────────────────────────────────────
  const getStatus = useCallback(
    () => request({ url: `/api/station/${stationId}/status` }),
    [request, stationId]
  );

  const getListeners = useCallback(
    () => request<unknown[]>({ url: `/api/station/${stationId}/listeners` }),
    [request, stationId]
  );

  const getNowPlaying = useCallback(
    () => request({ url: `/api/nowplaying/${stationId}` }),
    [request, stationId]
  );

  // ── Playlists ────────────────────────────────────────────────
  const getPlaylists = useCallback(
    () => request<unknown[]>({ url: `/api/station/${stationId}/playlists` }),
    [request, stationId]
  );

  const togglePlaylist = useCallback(
    (id: number) =>
      request({ method: 'PUT', url: `/api/station/${stationId}/playlist/${id}/toggle` }),
    [request, stationId]
  );

  const deletePlaylist = useCallback(
    (id: number) =>
      request({ method: 'DELETE', url: `/api/station/${stationId}/playlist/${id}` }),
    [request, stationId]
  );

  // ── Solicitudes de canciones ─────────────────────────────────
  const getPendingRequests = useCallback(
    () =>
      request<{ page: unknown; links: unknown; rows: unknown[] }>({
        url: `/api/station/${stationId}/requests`,
        params: { per_page: 50 },
      }),
    [request, stationId]
  );

  const approveRequest = useCallback(
    (id: string) =>
      request({
        method: 'DELETE',
        url: `/api/station/${stationId}/request/${id}`,
      }),
    [request, stationId]
  );

  // ── Streamers / DJs ──────────────────────────────────────────
  const getStreamers = useCallback(
    () => request<unknown[]>({ url: `/api/station/${stationId}/streamers` }),
    [request, stationId]
  );

  const createStreamer = useCallback(
    (data: {
      streamer_username: string;
      streamer_password: string;
      display_name: string;
      comments: string;
    }) =>
      request({
        method: 'POST',
        url: `/api/station/${stationId}/streamers`,
        data,
      }),
    [request, stationId]
  );

  const deleteStreamer = useCallback(
    (id: number) =>
      request({ method: 'DELETE', url: `/api/station/${stationId}/streamer/${id}` }),
    [request, stationId]
  );

  // ── Programación ─────────────────────────────────────────────
  const getSchedule = useCallback(
    () =>
      request<unknown[]>({
        url: `/api/station/${stationId}/schedules`,
        params: { now: Math.floor(Date.now() / 1000) },
      }),
    [request, stationId]
  );

  // ── Media ────────────────────────────────────────────────────
  const getMedia = useCallback(
    (page = 1) =>
      request<{ page: unknown; links: unknown; rows: unknown[] }>({
        url: `/api/station/${stationId}/files`,
        params: { per_page: 50, page },
      }),
    [request, stationId]
  );

  return {
    getStatus,
    getListeners,
    getNowPlaying,
    getPlaylists,
    togglePlaylist,
    deletePlaylist,
    getPendingRequests,
    approveRequest,
    getStreamers,
    createStreamer,
    deleteStreamer,
    getSchedule,
    getMedia,
    stationId,
  };
}
