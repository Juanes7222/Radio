import { useCallback } from 'react';
import axios, { type AxiosRequestConfig } from 'axios';
import { useAdminAuth } from '@/hooks/useAdminAuth';

const STATION_ID = import.meta.env.VITE_STATION_ID || 'la_voz_de_la_verdad';

export function useAdminApi() {
  const { token, user } = useAdminAuth();
  const stationId = user?.stationId ?? STATION_ID;

  /**
   * Todas las peticiones van a nuestro backend (/admin-api/...)
   * que las proxifica a AzuraCast añadiendo el API Key de forma segura.
   */
  const request = useCallback(
    async <T>(config: AxiosRequestConfig): Promise<T> => {
      const res = await axios<T>({
        ...config,
        headers: {
          ...(config.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
        timeout: config.timeout ?? 10000,
      });
      return res.data;
    },
    [token]
  );

  // ── Estadísticas ────────────────────────────────────────────
  const getStatus = useCallback(
    () => request({ url: '/admin-api/station/status' }),
    [request]
  );

  const getListeners = useCallback(
    () => request<unknown[]>({ url: '/admin-api/station/listeners' }),
    [request]
  );

  const getNowPlaying = useCallback(
    () => request({ url: '/admin-api/nowplaying' }),
    [request]
  );

  // ── Playlists ────────────────────────────────────────────────
  const getPlaylists = useCallback(
    () => request<unknown[]>({ url: '/admin-api/station/playlists' }),
    [request]
  );

  const togglePlaylist = useCallback(
    (id: number) =>
      request({ method: 'PUT', url: `/admin-api/station/playlist/${id}/toggle` }),
    [request]
  );

  const deletePlaylist = useCallback(
    (id: number) =>
      request({ method: 'DELETE', url: `/admin-api/station/playlist/${id}` }),
    [request]
  );

  // ── Solicitudes de canciones ─────────────────────────────────
  const getPendingRequests = useCallback(
    () =>
      request<{ page: unknown; links: unknown; rows: unknown[] }>({
        url: '/admin-api/station/requests',
        params: { per_page: 50 },
      }),
    [request]
  );

  const approveRequest = useCallback(
    (id: string) =>
      request({
        method: 'DELETE',
        url: `/admin-api/station/request/${id}`,
      }),
    [request]
  );

  // ── Streamers / DJs ──────────────────────────────────────────
  const getStreamers = useCallback(
    () => request<unknown[]>({ url: '/admin-api/station/streamers' }),
    [request]
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
        url: '/admin-api/station/streamers',
        data,
      }),
    [request]
  );

  const deleteStreamer = useCallback(
    (id: number) =>
      request({ method: 'DELETE', url: `/admin-api/station/streamer/${id}` }),
    [request]
  );

  // ── Programación ─────────────────────────────────────────────
  const getSchedule = useCallback(
    () =>
      request<unknown[]>({
        url: '/admin-api/station/schedule',
        params: { now: Math.floor(Date.now() / 1000) },
      }),
    [request]
  );

  // ── Media ────────────────────────────────────────────────────
  const getMedia = useCallback(
    (page = 1) =>
      request<{ page: unknown; links: unknown; rows: unknown[] }>({
        url: '/admin-api/station/files',
        params: { per_page: 50, page },
      }),
    [request]
  );

  const createPlaylist = useCallback(
    (data: {
      name: string;
      type: string;
      is_enabled: boolean;
      include_in_requests: boolean;
      order: string;
    }) =>
      request({
        method: 'POST',
        url: '/admin-api/station/playlists',
        data,
      }),
    [request]
  );

  // ── Controles de estación ─────────────────────────────────────
  const skipCurrentTrack = useCallback(
    () => request({ method: 'POST', url: '/admin-api/station/backend/skip' }),
    [request]
  );

  const restartStation = useCallback(
    () => request({ method: 'POST', url: '/admin-api/station/restart' }),
    [request]
  );

  return {
    getStatus,
    getListeners,
    getNowPlaying,
    getPlaylists,
    createPlaylist,
    togglePlaylist,
    deletePlaylist,
    getPendingRequests,
    approveRequest,
    getStreamers,
    createStreamer,
    deleteStreamer,
    getSchedule,
    getMedia,
    skipCurrentTrack,
    restartStation,
    stationId,
  };
}
