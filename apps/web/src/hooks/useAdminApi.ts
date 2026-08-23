import { useCallback } from 'react';
import axios, { type AxiosRequestConfig } from 'axios';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import type {
  AdminDeviceList,
  DeviceZoneList,
  ListenerHistoryResponse,
  LocutorAudio,
  LocutorStatus,
  LocutorTemplate,
  LocutorTemplateInput,
  MediaFile,
  BibleReadingHistoryEntry,
  NotificationStats,
  PrayerListResponse,
  PrayerRequestUpdatePayload,
  PrayerBulkResult,
  PlaylistDetail,
  PlaylistOrderEntry,
  PlaylistRotation,
  PushCampaignInput,
  PushCampaignResult,
  PushNotificationLogList,
  RotationRunLog,
  RotationRunResult,
  ScheduleCategory,
  WorkerJob,
  WorkerNodeInfo,
} from '@radio/types';
import { API_BASE_URL } from '@/config';

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
        // All routes are relative (e.g. /admin-api/...), so prefix them with
        // the configured backend origin. Empty API_BASE_URL keeps same-origin.
        // Absolute URLs pass through untouched.
        url: config.url?.startsWith('http')
          ? config.url
          : `${API_BASE_URL}${config.url ?? ''}`,
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

  // ── Historial de oyentes ─────────────────────────────────
  const getListenerHistory = useCallback(
    (hours = 24) =>
      request<ListenerHistoryResponse>({
        url: '/admin-api/listeners/history',
        params: { hours },
      }),
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

  // ── Contenido y horarios de playlists ────────────────────────
  const getPlaylistDetail = useCallback(
    (id: number) => request<PlaylistDetail>({ url: `/admin-api/station/playlist/${id}` }),
    [request]
  );

  const updatePlaylist = useCallback(
    (id: number, data: Record<string, unknown>) =>
      request({ method: 'PUT', url: `/admin-api/station/playlist/${id}`, data }),
    [request]
  );

  const getPlaylistOrder = useCallback(
    (id: number) => request<PlaylistOrderEntry[]>({ url: `/admin-api/station/playlist/${id}/order` }),
    [request]
  );

  const setPlaylistOrder = useCallback(
    (id: number, order: Record<number, number>) =>
      request({ method: 'PUT', url: `/admin-api/station/playlist/${id}/order`, data: { order } }),
    [request]
  );

  const clonePlaylist = useCallback(
    (id: number) =>
      request<{ id: number; name: string }>({
        method: 'POST',
        url: `/admin-api/station/playlist/${id}/clone`,
      }),
    [request]
  );

  const getMediaFile = useCallback(
    (id: string | number) => request<MediaFile>({ url: `/admin-api/station/file/${id}` }),
    [request]
  );

  const getMediaDirectories = useCallback(
    (currentDirectory = '') =>
      request<{ rows: { name: string; path: string }[] }>({
        url: '/admin-api/station/files/directories',
        params: currentDirectory ? { currentDirectory } : {},
      }),
    [request]
  );

  const setFilePlaylists = useCallback(
    (id: string | number, playlists: number[]) =>
      request({ method: 'PUT', url: `/admin-api/station/file/${id}`, data: { playlists } }),
    [request]
  );

  // ── Rotaciones de playlists ──────────────────────────────────
  const getRotations = useCallback(
    () => request<PlaylistRotation[]>({ url: '/admin-api/rotations' }),
    [request]
  );

  const getRotation = useCallback(
    (id: string) => request<PlaylistRotation>({ url: `/admin-api/rotations/${id}` }),
    [request]
  );

  const createRotation = useCallback(
    (data: Record<string, unknown>) =>
      request<PlaylistRotation>({ method: 'POST', url: '/admin-api/rotations', data }),
    [request]
  );

  const updateRotation = useCallback(
    (id: string, data: Record<string, unknown>) =>
      request<PlaylistRotation>({ method: 'PUT', url: `/admin-api/rotations/${id}`, data }),
    [request]
  );

  const deleteRotation = useCallback(
    (id: string) => request({ method: 'DELETE', url: `/admin-api/rotations/${id}` }),
    [request]
  );

  const runRotation = useCallback(
    (id: string) =>
      request<RotationRunResult>({ method: 'POST', url: `/admin-api/rotations/${id}/run` }),
    [request]
  );

  const getRotationRuns = useCallback(
    (id: string, limit = 50) =>
      request<RotationRunLog[]>({
        url: `/admin-api/rotations/${id}/runs`,
        params: { limit },
      }),
    [request]
  );

  const getReadingHistory = useCallback(
    (limit = 90) =>
      request<BibleReadingHistoryEntry[]>({
        url: '/admin-api/rotations/history',
        params: { limit },
      }),
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

    // ── Peticiones de oración ──────────────────────────────────
    const getPrayerRequests = useCallback(
      (params: { page?: number; limit?: number; estado?: string; search?: string } = {}) =>
        request<PrayerListResponse>({
          url: '/api/prayer',
          params,
        }),
      [request]
    );

    const updatePrayerRequest = useCallback(
      (id: string, data: PrayerRequestUpdatePayload) =>
        request({
          method: 'PUT',
          url: `/api/prayer/${id}`,
          data,
        }),
      [request]
    );

    const markPrayerRequestRead = useCallback(
      (id: string) =>
        request({
          method: 'POST',
          url: `/api/prayer/${id}/read`,
        }),
      [request]
    );

    const deletePrayerRequest = useCallback(
      (id: string) =>
        request({
          method: 'DELETE',
          url: `/api/prayer/${id}`,
        }),
      [request]
    );

    const bulkMarkPrayerRequestsRead = useCallback(
      (ids: string[]) =>
        request<PrayerBulkResult>({
          method: 'POST',
          url: '/api/prayer/bulk/read',
          data: { ids },
        }),
      [request]
    );

    const bulkUpdatePrayerRequestStatus = useCallback(
      (ids: string[], estado: string) =>
        request<PrayerBulkResult>({
          method: 'POST',
          url: '/api/prayer/bulk/status',
          data: { ids, estado },
        }),
      [request]
    );

    const bulkDeletePrayerRequests = useCallback(
      (ids: string[]) =>
        request<PrayerBulkResult>({
          method: 'POST',
          url: '/api/prayer/bulk/delete',
          data: { ids },
        }),
      [request]
    );

    const createPrayerStreamTicket = useCallback(
      () =>
        request<{ ticket: string; expiresInMs: number }>({
          method: 'POST',
          url: '/api/prayer/events/ticket',
        }),
      [request]
    );

    // ── Media ────────────────────────────────────────────────────
    const getMedia = useCallback(
      (page = 1, perPage = 50) =>
        request<{ page: unknown; links: unknown; rows: MediaFile[] }>({
          url: '/admin-api/station/files',
          params: { per_page: perPage, page },
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

  // ── Categorías de programación ──────────────────────────────
  const getScheduleCategories = useCallback(
    () => request<ScheduleCategory[]>({ url: '/admin-api/schedule-categories' }),
    [request]
  );

  const createScheduleCategory = useCallback(
    (data: Partial<ScheduleCategory>) =>
      request<ScheduleCategory>({
        method: 'POST',
        url: '/admin-api/schedule-categories',
        data,
      }),
    [request]
  );

  const updateScheduleCategory = useCallback(
    (id: string, data: Partial<ScheduleCategory>) =>
      request<ScheduleCategory>({
        method: 'PUT',
        url: `/admin-api/schedule-categories/${id}`,
        data,
      }),
    [request]
  );

  const deleteScheduleCategory = useCallback(
    (id: string) =>
      request({
        method: 'DELETE',
        url: `/admin-api/schedule-categories/${id}`,
      }),
    [request]
  );

  // ── Locutor (TTS) ──────────────────────────────────────────
  const getLocutorStatus = useCallback(
    () => request<LocutorStatus>({ url: '/admin-api/locutor/status' }),
    [request]
  );

  const getLocutorTemplates = useCallback(
    () => request<LocutorTemplate[]>({ url: '/admin-api/locutor/templates' }),
    [request]
  );

  const saveLocutorTemplate = useCallback(
    (data: LocutorTemplateInput, id?: string) => {
      const body = {
        type: data.type,
        name: data.name,
        text_template: data.textTemplate,
        voice: data.voice,
        speed: data.speed,
        active: data.active,
      };
      return request({
        method: id ? 'PUT' : 'POST',
        url: id ? `/admin-api/locutor/templates/${id}` : '/admin-api/locutor/templates',
        data: body,
      });
    },
    [request]
  );

  const deleteLocutorTemplate = useCallback(
    (id: string) =>
      request({ method: 'DELETE', url: `/admin-api/locutor/templates/${id}` }),
    [request]
  );

  const getLocutorAudios = useCallback(
    () => request<LocutorAudio[]>({ url: '/admin-api/locutor/audios' }),
    [request]
  );

  const deleteLocutorAudio = useCallback(
    (id: string) =>
      request({ method: 'DELETE', url: `/admin-api/locutor/audios/${id}` }),
    [request]
  );

  const generateLocutorAudio = useCallback(
    (templateId: string) =>
      request({
        method: 'POST',
        url: `/admin-api/locutor/audios/generate/${templateId}`,
        data: { variables: {} },
      }),
    [request]
  );

  // ── Dispositivos y notificaciones ─────────────────────────────
  const getDevices = useCallback(
    (params: { page?: number; limit?: number; program?: string; zone?: string } = {}) =>
      request<AdminDeviceList>({ url: '/admin-api/devices', params }),
    [request]
  );

  const getDeviceZones = useCallback(
    () => request<DeviceZoneList>({ url: '/admin-api/devices/zones' }),
    [request]
  );

  const assignDeviceZone = useCallback(
    (deviceId: string, zoneId: string | null) =>
      request({ method: 'PUT', url: `/admin-api/devices/${deviceId}/zone`, data: { zoneId } }),
    [request]
  );

  const previewPushCampaign = useCallback(
    (input: PushCampaignInput) =>
      request<{ targeted: number }>({
        method: 'POST',
        url: '/admin-api/devices/preview-notification',
        data: input,
      }),
    [request]
  );

  const sendPushCampaign = useCallback(
    (input: PushCampaignInput) =>
      request<PushCampaignResult>({
        method: 'POST',
        url: '/admin-api/devices/send-notification',
        data: input,
        timeout: 60000,
      }),
    [request]
  );

  const getPushNotificationLogs = useCallback(
    (params: { page?: number; limit?: number } = {}) =>
      request<PushNotificationLogList>({ url: '/admin-api/devices/notification-logs', params }),
    [request]
  );

  const getNotificationStats = useCallback(
    () => request<NotificationStats>({ url: '/admin-api/devices/notifications-stats' }),
    [request]
  );

  // ── Workers y YouTube ─────────────────────────────────────────
  const getWorkers = useCallback(
    () => request<WorkerNodeInfo[]>({ url: '/admin-api/workers/workers' }),
    [request]
  );

  const getWorkerJobs = useCallback(
    () => request<WorkerJob[]>({ url: '/admin-api/workers/jobs' }),
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
    getListenerHistory,
    getPlaylists,
    createPlaylist,
    togglePlaylist,
    deletePlaylist,
    getPlaylistDetail,
    updatePlaylist,
    getPlaylistOrder,
    setPlaylistOrder,
    clonePlaylist,
    getMediaFile,
    setFilePlaylists,
    getMediaDirectories,
    getRotations,
    getRotation,
    createRotation,
    updateRotation,
    deleteRotation,
    runRotation,
    getRotationRuns,
    getReadingHistory,
    getPendingRequests,
    approveRequest,
    getPrayerRequests,
    updatePrayerRequest,
    markPrayerRequestRead,
    deletePrayerRequest,
    bulkMarkPrayerRequestsRead,
    bulkUpdatePrayerRequestStatus,
    bulkDeletePrayerRequests,
    createPrayerStreamTicket,
    getStreamers,
    createStreamer,
    deleteStreamer,
    getSchedule,
    getMedia,
    getScheduleCategories,
    createScheduleCategory,
    updateScheduleCategory,
    deleteScheduleCategory,
    getLocutorStatus,
    getLocutorTemplates,
    saveLocutorTemplate,
    deleteLocutorTemplate,
    getLocutorAudios,
    deleteLocutorAudio,
    generateLocutorAudio,
    getDevices,
    getDeviceZones,
    assignDeviceZone,
    previewPushCampaign,
    sendPushCampaign,
    getPushNotificationLogs,
    getNotificationStats,
    getWorkers,
    getWorkerJobs,
    skipCurrentTrack,
    restartStation,
    stationId,
  };
}
