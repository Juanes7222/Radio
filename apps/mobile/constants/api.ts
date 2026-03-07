/**
 * Backend base URL. Used as the API origin for all public radio data.
 * For local dev, set EXPO_PUBLIC_BACKEND_URL in your .env file.
 */
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://tu-vps.com';
