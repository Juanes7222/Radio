import { BACKEND_URL } from "@/constants/api";

/**
 * Resolves a notice media URL (image or video) to an absolute URL.
 */
export function resolveNoticeMediaUri(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/media/")) return `${BACKEND_URL}/api${url}`;
  if (url.startsWith("/api/media/")) return `${BACKEND_URL}${url}`;
  return url;
}

export const resolveNoticeImageUri = resolveNoticeMediaUri;
export const resolveNoticeVideoUri = resolveNoticeMediaUri;

export function deriveVideoPosterUri(videoUrl: string | null): string | null {
  if (!videoUrl) return null;
  if (!videoUrl.startsWith("/media/notice-videos/")) return null;
  return videoUrl.replace(/\.[^/.]+$/, "_poster.webp");
}

export function resolveVideoPosterUri(videoUrl: string | null): string | null {
  return resolveNoticeMediaUri(deriveVideoPosterUri(videoUrl));
}
