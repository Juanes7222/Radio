/**
 * Central configuration for the web app.
 *
 * All server communication (REST, SSE and the admin panel) goes through
 * API_BASE_URL, so a single environment variable defines where the frontend
 * talks to. It is derived from VITE_API_BASE_URL, which is empty when the app
 * is served from the same origin as the backend (Vite dev proxy or nginx).
 */

const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/** Backend origin without a trailing slash. Empty means same-origin. */
export const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, '');

/** Joins a backend path with the configured base URL. */
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
