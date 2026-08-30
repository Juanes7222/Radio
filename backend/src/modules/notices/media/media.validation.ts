import { ALLOWED_IMAGE_MIMES, ALLOWED_VIDEO_MIMES } from "./media.config";

/**
 * Validates image mime type against allowed list.
 */
export function isAllowedImageMime(mimeType: string): boolean {
  return (ALLOWED_IMAGE_MIMES as readonly string[]).includes(mimeType);
}

/**
 * Validates video mime type.
 * Allows any video/* as fallback for forward compatibility,
 * but prefers the explicit allow-list.
 */
export function isAllowedVideoMime(mimeType: string): boolean {
  if (ALLOWED_VIDEO_MIMES.has(mimeType)) return true;
  return mimeType.startsWith("video/");
}
