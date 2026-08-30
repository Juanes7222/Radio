import path from "path";
import fs from "fs";

/**
 * Resolves the storage directory for notice media.
 * Checks multiple candidate paths to support different execution contexts
 * (dev via ts-node, built dist, Docker).
 */
function resolveMediaDir(subdir: string): string {
  const candidates = [
    path.resolve(process.cwd(), "backend", "storage", subdir),
    path.resolve(process.cwd(), "storage", subdir),
    path.resolve(__dirname, "../../storage", subdir),
    path.resolve(__dirname, "../../../storage", subdir),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export const NOTICE_IMAGES_DIR = resolveMediaDir("notice-images");
export const NOTICE_VIDEOS_DIR = resolveMediaDir("notice-videos");

/**
 * Ensures a directory exists, creating it recursively if needed.
 */
export function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore - directory creation is best-effort; subsequent writes will surface errors
  }
}

// Initialize directories on import (idempotent)
ensureDir(NOTICE_IMAGES_DIR);
ensureDir(NOTICE_VIDEOS_DIR);

/**
 * Builds the full file system path for a media file.
 */
export function getMediaFilePath(dir: string, filename: string): string {
  return path.join(dir, filename);
}

/**
 * Deletes a file if it exists. Silently ignores missing files.
 */
export function deleteMediaFileIfExists(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore deletion errors - DB record is authoritative
  }
}

/**
 * Persists a buffer to disk.
 */
export function writeMediaFile(filePath: string, buffer: Buffer): void {
  fs.writeFileSync(filePath, buffer);
}
