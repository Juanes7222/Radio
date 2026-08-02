const SAFE_FILENAME_CHARS = /[^a-zA-Z0-9._\-() ÁÉÍÓÚáéíóúñÑüÜ]/g;

/** Replaces every unsupported character with an underscore, preserving folder structure. */
export function sanitizeFilename(value: string): string {
  return value.replace(SAFE_FILENAME_CHARS, "_");
}

/** Sanitizes each segment of a relative path, preserving the folder structure. */
export function sanitizeRelativePath(value: string): string {
  return value
    .replace(/^\/+/, "")
    .split("/")
    .map(sanitizeFilename)
    .join("/");
}

/** Strips accents and lowercases a string for matching purposes. */
export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
