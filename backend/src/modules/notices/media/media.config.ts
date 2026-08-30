/**
 * Configuration for notice media (images and videos).
 * All constants are in English and represent technical limits.
 */

export const NOTICE_IMAGE_MAX_BYTES = 20 * 1024 * 1024; // 20 MB — optimized to WebP on upload
export const NOTICE_VIDEO_MAX_BYTES = 120 * 1024 * 1024; // 120 MB — transcoded to 720p H.264 on upload

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
]);

/**
 * Extension mapping for known video mime types.
 * Falls back to original file extension when mime is unknown.
 */
export const VIDEO_EXT_BY_MIME: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "video/x-matroska": ".mkv",
};

/** Public URL prefixes used for notice media */
export const NOTICE_IMAGE_URL_PREFIX = "/media/notices";
export const NOTICE_VIDEO_URL_PREFIX = "/media/notice-videos";
