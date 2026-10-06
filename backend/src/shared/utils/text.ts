const DIACRITIC_RANGE = /[\u0300-\u036f]/g;
const NON_WORD_CHARS = /[^\p{L}\p{N}\s]/gu;
const SLUG_INVALID_CHARS = /[^a-z0-9]+/g;

/** Lowercases, removes diacritics and collapses whitespace. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITIC_RANGE, "")
    .trim();
}

/** Removes diacritics while preserving the original casing. */
function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(DIACRITIC_RANGE, "");
}

/** Capitalizes the first letter of every word. */
function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Builds a readable title out of an uploaded file name: the extension is
 * dropped, diacritics and punctuation become spaces, and the result is
 * capitalized. Falls back to `fallback` when nothing usable is left.
 */
export function titleFromFilename(fileName: string, fallback: string): string {
  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, "");
  const cleaned = stripDiacritics(withoutExtension).replace(NON_WORD_CHARS, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? toTitleCase(cleaned) : fallback;
}

/** Lowercase, dash-separated identifier safe for library folder names. */
export function slugify(value: string): string {
  const slug = stripDiacritics(value)
    .toLowerCase()
    .replace(SLUG_INVALID_CHARS, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}