/**
 * Standalone, hook-free API helpers shared by web and mobile.
 *
 * Unlike `useAzuraCast`, these functions do NOT open a realtime SSE/WebSocket
 * connection nor start polling, so they are safe to call from any screen
 * without spawning duplicate connections.
 */
import axios from 'axios';
import type {
  CreateFeedbackPayload,
  ScheduleCategorySummary,
  ScheduleItem,
  SongRequest,
} from '@radio/types';

const TIMEOUT_MS = 10000;

export type SongRequestResult =
  | { success: true }
  | { success: false; errorMessage: string };

export type SubmitFeedbackResult =
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

/**
 * Absolute AzuraCast media URLs, whatever origin they carry.
 *
 * Artwork arrives as an absolute URL built from the address the deployment
 * happened to use (a LAN IP, a container hostname, a stale panel domain). None
 * of those are reachable from a listener's browser, and on an HTTPS page an
 * `http://` one is rejected twice: as mixed content, and by the site CSP
 * (`img-src 'self' data: https: blob:`), which only ever allows the page's own
 * scheme. The backend proxies `/api/station/*` already, so keeping just the
 * path is enough — and it is the only rewrite that holds no matter how the
 * station is configured.
 *
 * Scoped to `/api/station/` on purpose. `station.mounts[].url` and
 * `listen_url` are absolute too and must stay that way: they address the
 * ICEcast server, not this origin.
 */
const FOREIGN_MEDIA_URL = /https?:\/\/[^/"\\]+(\/api\/station\/[^"\\]*)/g;

/**
 * Re-points AzuraCast media URLs at the page origin.
 *
 * Applied after `rewriteLocalhostUrls`, which only covers loopback addresses.
 * The payload is serialized so one pass covers every nested field; when the
 * replacement changes nothing — the common case, since most deployments already
 * report public URLs — the original object is returned untouched, which keeps
 * the nowplaying poll and the realtime stream free of a needless round trip.
 */
export function toSameOriginMediaUrls<T>(data: T, apiBaseUrl: string): T {
  const baseUrl = effectiveBaseUrl(apiBaseUrl);
  if (!baseUrl) return data;
  if (data === null || typeof data !== 'object') return data;
  const serialized = JSON.stringify(data);
  const rewritten = serialized.replace(
    FOREIGN_MEDIA_URL,
    (_match, path: string) => `${baseUrl}${path}`,
  );
  if (rewritten === serialized) return data;
  return JSON.parse(rewritten) as T;
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

/**
 * Sends a listener opinion to the station inbox. Returns a discriminated
 * result instead of throwing, because every caller has to render an inline
 * error next to the form rather than crash the screen.
 */
export async function submitFeedback(
  apiBaseUrl: string,
  payload: CreateFeedbackPayload
): Promise<SubmitFeedbackResult> {
  try {
    await axios.post(`${apiBaseUrl}/api/feedback`, payload, {
      timeout: TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' },
    });
    return { success: true };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const serverMessage: string | undefined =
        err.response?.data?.error ?? err.response?.data?.message;
      if (serverMessage) return { success: false, errorMessage: serverMessage };
      if (err.code === 'ECONNABORTED') {
        return { success: false, errorMessage: 'Tiempo de espera agotado.' };
      }
    }
    return { success: false, errorMessage: 'No se pudo enviar el mensaje.' };
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

  const data = toSameOriginMediaUrls(rewriteLocalhostUrls(response.data, apiBaseUrl), apiBaseUrl);
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
    const data = toSameOriginMediaUrls(rewriteLocalhostUrls(response.data, apiBaseUrl), apiBaseUrl);
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
