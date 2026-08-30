import { API_BASE_URL } from "@/config";

/**
 * Resolves a notice media URL to an absolute URL.
 * Handles internal /media/* paths by prefixing the API base.
 */
export function resolveNoticeMediaSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/media/")) return `${API_BASE_URL}/api${url}`;
  return url;
}

/** Backward-compatible alias for image-only contexts */
export const resolveNoticeImageSrc = resolveNoticeMediaSrc;

/**
 * Derives the poster thumbnail URL for a video.
 * Convention: /media/notice-videos/<base>.mp4 -> /media/notice-videos/<base>_poster.webp
 * Returns null if video URL is not an internal media path.
 */
export function deriveVideoPosterUrl(videoUrl: string | null | undefined): string | null {
  if (!videoUrl) return null;
  if (!videoUrl.startsWith("/media/notice-videos/")) return null;
  const withoutExt = videoUrl.replace(/\.[^/.]+$/, "");
  return `${withoutExt}_poster.webp`;
}

/** Resolves poster URL to absolute URL for <video poster> usage */
export function resolveVideoPosterSrc(videoUrl: string | null | undefined): string | null {
  const poster = deriveVideoPosterUrl(videoUrl);
  return poster ? resolveNoticeMediaSrc(poster) : null;
}
