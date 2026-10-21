/**
 * The Bible helpers of the public site: the reading of the day and the paths
 * of the generated chapter pages.
 *
 * The reading is asked for the way the rest of the site asks the backend for
 * it (a fetch against the configured origin), so there is one call and not two.
 */
import { apiUrl } from "@/config";
import type { BibleChapterRef, BibleReadingToday } from "@radio/types";

function isChapterRef(value: unknown): value is BibleChapterRef {
  if (typeof value !== "object" || value === null) return false;
  const chapter = value as { book?: unknown; chapter?: unknown };
  return typeof chapter.book === "string" && typeof chapter.chapter === "number";
}

/**
 * Reads the reading out of the answer of the backend.
 *
 * A payload that is not the expected shape is read as "no reading": the page
 * says that there is nothing scheduled instead of crashing on a chapter list
 * that is not there.
 */
function readReading(payload: unknown): BibleReadingToday["reading"] {
  if (typeof payload !== "object" || payload === null) return null;
  const reading = (payload as { reading?: unknown }).reading;
  if (typeof reading !== "object" || reading === null) return null;

  const record = reading as { rotationName?: unknown; chapters?: unknown };
  if (!Array.isArray(record.chapters)) return null;

  return {
    rotationName: typeof record.rotationName === "string" ? record.rotationName : "",
    chapters: record.chapters.filter(isChapterRef),
  };
}

/**
 * The reading the station has scheduled for today.
 *
 * Throws when the backend fails, so the caller can tell an error apart from a
 * day without a reading scheduled.
 */
export async function fetchTodayReading(): Promise<BibleReadingToday> {
  const response = await fetch(apiUrl("/api/bible/reading/today"));
  if (!response.ok) {
    throw new Error("No se pudo consultar la lectura de hoy.");
  }
  const payload: unknown = await response.json();
  return { reading: readReading(payload) };
}

/**
 * The slug of a book, the one the generated pages carry in their path.
 *
 * It mirrors the rule of the backend export
 * (`backend/src/shared/utils/text.ts`), which is what names those pages: the
 * diacritics go away, the name is lowercased and what is left is separated by
 * dashes. The canonical book names never fold to the same slug, so the name is
 * enough to find the page of a chapter.
 */
export function bookSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The path of the generated page of a chapter. */
export function chapterPath(book: string, chapter: number): string {
  return `/biblia/${bookSlug(book)}/${chapter}/`;
}
