/**
 * The Bible helpers of the public site: the reading of the day, the map of
 * the published books and the paths of the generated chapter pages.
 *
 * The reading is asked for the way the rest of the site asks the backend for
 * it (a fetch against the configured origin), so there is one call and not two.
 */
import { apiUrl } from "@/config";
import { BOOK_SLUGS_PATH, type BookSlugs } from "@/config/catalog";
import type { BibleChapterRef, BibleReadingToday } from "@radio/types";

/** What the page says when the answer is not the one the contract promises. */
const UNREADABLE = "La lectura de hoy llegó en un formato que no se entiende.";

function isChapterRef(value: unknown): value is BibleChapterRef {
  if (typeof value !== "object" || value === null) return false;
  const chapter = value as { book?: unknown; chapter?: unknown };
  return typeof chapter.book === "string" && typeof chapter.chapter === "number";
}

/** An array or nothing, without the `any` that `Array.isArray` narrows to. */
function toArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

/**
 * Reads the reading out of the answer of the backend.
 *
 * `reading: null` is an answer: the day has no reading scheduled. A payload
 * that is not the one the contract promises is not an absence, it is a
 * failure, and the page has to say so instead of saying that nothing is
 * scheduled.
 */
function readReading(payload: unknown): BibleReadingToday["reading"] {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(UNREADABLE);
  }

  const reading = (payload as { reading?: unknown }).reading;
  if (reading === null) return null;
  if (typeof reading !== "object" || reading === undefined) {
    throw new Error(UNREADABLE);
  }

  const record = reading as { rotationName?: unknown; chapters?: unknown };
  if (typeof record.rotationName !== "string") {
    throw new Error(UNREADABLE);
  }

  const chapters = toArray(record.chapters);
  if (chapters === null) {
    throw new Error(UNREADABLE);
  }

  const refs: BibleChapterRef[] = [];
  for (const chapter of chapters) {
    if (!isChapterRef(chapter)) {
      throw new Error(UNREADABLE);
    }
    refs.push(chapter);
  }

  return { rotationName: record.rotationName, chapters: refs };
}

/**
 * The reading the station has scheduled for today.
 *
 * Throws when the backend fails or answers something unreadable, so the
 * caller can tell an error apart from a day without a reading scheduled.
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
 * The map of the published books: name → slug.
 *
 * The build writes it next to the pages it generates, because the artifact is
 * what owns the slugs. A build without the catalog has no map, and a book
 * that is not in the map has no published page: both end with the chapters
 * rendered without a link, never with a link to a page that was never built.
 */
export async function fetchBookSlugs(): Promise<BookSlugs> {
  try {
    const response = await fetch(BOOK_SLUGS_PATH);
    if (!response.ok) return {};
    const payload: unknown = await response.json();
    return isBookSlugs(payload) ? payload : {};
  } catch {
    return {};
  }
}

function isBookSlugs(value: unknown): value is BookSlugs {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Object.values(record).every((slug) => typeof slug === "string");
}

/** A chapter of the reading and the page the build published for it. */
export interface ChapterLink {
  /** What the reader sees: "Job 1". */
  readonly label: string;
  /** The path of the page, or null when the book has no published page. */
  readonly href: string | null;
}

/**
 * Resolves a chapter of the reading to the page the build published for it.
 *
 * The slug comes from the map the build wrote, so the link is the one the
 * build actually published. A book that is not in the map has no page, and
 * the chapter is rendered without a link.
 */
export function chapterLink(
  book: string,
  chapter: number,
  slugs: BookSlugs,
): ChapterLink {
  const slug = slugs[book];
  return {
    label: `${book} ${chapter}`,
    href: slug === undefined ? null : `/biblia/${slug}/${chapter}/`,
  };
}
