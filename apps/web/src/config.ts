/**
 * Central configuration for the web app.
 *
 * Every server call (REST, SSE and the admin panel) goes through apiUrl(), so a
 * single environment variable defines where the browser talks to.
 *
 * VITE_API_BASE_URL must be either empty or an absolute http(s) URL:
 * - empty: same origin. Requests stay relative and reach the backend through
 *   the Vite dev proxy (development) or nginx (production). Preferred, because
 *   it keeps the app free of CORS and third-party cookie restrictions.
 * - absolute: the API is a different origin, which requires the backend to
 *   allow this app's origin via CORS.
 *
 * The dev proxy target is configured separately (VITE_API_PROXY_TARGET in
 * vite.config.ts) so pointing the local frontend at a remote backend does not
 * force cross-origin requests in the browser.
 */

const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

function normalizeApiBaseUrl(raw: string): string {
  if (!raw) return '';

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `Invalid VITE_API_BASE_URL: "${raw}". Use an absolute URL such as "https://api.example.com", or leave it empty to call the backend on the same origin.`,
    );
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid VITE_API_BASE_URL: "${raw}". The URL must start with "http://" or "https://".`,
    );
  }

  if (parsed.search || parsed.hash) {
    throw new Error(`Invalid VITE_API_BASE_URL: "${raw}". Query strings and fragments are not allowed.`);
  }

  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

/** Backend origin without a trailing slash. Empty means same-origin. */
export const API_BASE_URL = normalizeApiBaseUrl(RAW_API_BASE_URL);

/** Joins a backend path with the configured base URL. */
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  // /media/* necesita pasar por /api para que nginx lo proxee al backend (ver backend/src/app.ts /api/media)
  const proxiedPath = cleanPath.startsWith('/media/') ? `/api${cleanPath}` : cleanPath;
  return `${API_BASE_URL}${proxiedPath}`;
}