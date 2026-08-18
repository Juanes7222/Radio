/**
 * Standalone, hook-free API helpers shared by web and mobile.
 *
 * Unlike `useAzuraCast`, these functions do NOT open a realtime SSE/WebSocket
 * connection nor start polling, so they are safe to call from any screen
 * without spawning duplicate connections.
 */
import axios from 'axios';
import type {
  ScheduleCategorySummary,
  ScheduleItem,
  SongRequest,
} from '@radio/types';

const TIMEOUT_MS = 10000;

export type SongRequestResult =
  | { success: true }
  | { success: false; errorMessage: string };

/**
 * Returns the configured API origin, falling back to the current window origin
 * on web so localhost URLs coming from AzuraCast are rewritten consistently.
 */
function effectiveBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
}

/**
 * Rewrites localhost/127.0.0.1 URLs coming from AzuraCast to the configured
 * origin, avoiding Mixed Content / CSP issues on production deployments.
 * Production payloads never contain localhost, so the JSON round-trip is
 * skipped unless the data actually needs it.
 */
export function rewriteLocalhostUrls<T>(data: T, apiBaseUrl: string): T {
  const baseUrl = effectiveBaseUrl(apiBaseUrl);
  if (!baseUrl) return data;
  if (data === null || data === undefined) return data;
  const serialized = JSON.stringify(data);
  if (!/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(serialized)) return data;
  return JSON.parse(
    serialized.replace(/https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/g, baseUrl)
  ) as T;
}

/** Extracts a typed array from a payload that may wrap it in `result`, `rows` or `data`. */
function pickArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    for (const key of keys) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

export async function requestSong(
  apiBaseUrl: string,
  requestId: string
): Promise<SongRequestResult> {
  try {
    await axios.post(`${apiBaseUrl}/api/requests/${requestId}`);
    return { success: true };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const serverMessage: string | undefined =
        err.response?.data?.message ?? err.response?.data?.error;
      if (serverMessage) return { success: false, errorMessage: serverMessage };
      if (err.code === 'ECONNABORTED') {
        return { success: false, errorMessage: 'Tiempo de espera agotado.' };
      }
    }
    return { success: false, errorMessage: 'No se pudo solicitar la canción.' };
  }
}

export async function fetchRequestableSongs(
  apiBaseUrl: string,
  options: { page?: number; perPage?: number; search?: string } = {}
): Promise<SongRequest[]> {
  const { page = 1, perPage = 25, search = '' } = options;
  const params: Record<string, string> = {
    page: String(page),
    per_page: String(perPage),
  };
  if (search.trim()) params.search = search.trim();

  const response = await axios.get(`${apiBaseUrl}/api/search`, {
    params,
    timeout: TIMEOUT_MS,
    headers: { Accept: 'application/json' },
  });

  const data = rewriteLocalhostUrls(response.data, apiBaseUrl);
  return pickArray<SongRequest>(data, ['result', 'rows', 'data']);
}

export async function fetchSchedule(
  apiBaseUrl: string
): Promise<ScheduleItem[] | null> {
  try {
    const response = await axios.get(`${apiBaseUrl}/api/schedule`, {
      timeout: TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });
    const data = rewriteLocalhostUrls(response.data, apiBaseUrl);
    return pickArray<ScheduleItem>(data, ['result', 'rows', 'data']);
  } catch {
    return null;
  }
}

export async function fetchScheduleCategories(
  apiBaseUrl: string
): Promise<ScheduleCategorySummary[] | null> {
  try {
    const response = await axios.get(`${apiBaseUrl}/api/schedule/categories`, {
      timeout: TIMEOUT_MS,
      headers: { Accept: 'application/json' },
    });
    return Array.isArray(response.data)
      ? response.data
      : pickArray<ScheduleCategorySummary>(response.data, ['result', 'rows', 'data']);
  } catch {
    return null;
  }
}
