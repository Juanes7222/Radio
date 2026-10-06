import fs from "fs";
import path from "path";

/**
 * Resolves a directory inside the local storage tree.
 * Several candidates are checked so the same code works when the process runs
 * from the repo root (ts-node), from `backend` (dev script) or from `dist`.
 */
export function resolveStorageDir(subdir: string): string {
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

/** Creates a directory and its parents, ignoring failures. */
export function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // Best effort: the write that follows surfaces the real error.
  }
}

/** Joins a storage directory with a file name. */
export function getMediaFilePath(dir: string, filename: string): string {
  return path.join(dir, filename);
}

/** Deletes a file, ignoring missing files and permission errors. */
export function deleteMediaFileIfExists(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // The database record stays authoritative.
  }
}

/** Writes a buffer to disk. */
export function writeMediaFile(filePath: string, buffer: Buffer): void {
  fs.writeFileSync(filePath, buffer);
}

/** Creates a storage subdirectory and returns its absolute path. */
export function prepareStorageDir(subdir: string): string {
  const dir = resolveStorageDir(subdir);
  ensureDir(dir);
  return dir;
}