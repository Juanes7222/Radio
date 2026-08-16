/**
 * Backend base URL. Used as the API origin for all public radio data.
 * For local dev, set EXPO_PUBLIC_BACKEND_URL in your .env file.
 */
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://tu-vps.com';

/**
 * Public web origin where the legal pages (terms, privacy, data treatment,
 * cookies) are served. Set EXPO_PUBLIC_WEB_URL when the web frontend lives
 * on a different domain than the backend. Falls back to the backend origin,
 * which is correct when web and API share a domain behind a proxy.
 */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? BACKEND_URL;
export const STATION_UTC_OFFSET_HOURS = -5; // Bogota (UTC-5)