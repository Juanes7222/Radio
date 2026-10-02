/**
 * Turns a free-text search query into a typed intent, if it looks like one.
 *
 * Pure and dependency-free so the resolution rules can be exercised against a
 * table of cases without a database or an HTTP server.
 */
import { resolveBook } from "./bookCatalog";

export type ParsedReference =
  | { kind: "book"; bookOrder: number }
  | { kind: "chapter"; bookOrder: number; chapter: number }
  | {
      kind: "verse";
      bookOrder: number;
      chapter: number;
      verseStart: number;
      verseEnd?: number;
    };

const ORDINAL_TO_DIGIT: Record<string, string> = {
  primera: "1",
  primero: "1",
  primer: "1",
  segunda: "2",
  segundo: "2",
  tercera: "3",
  tercero: "3",
  tercer: "3",
};

// Lets people type "primera de Juan" the way they'd say it out loud.
function spellOutOrdinalPrefix(query: string): string {
  const match = query.match(
    /^(primero|primera|primer|segundo|segunda|tercero|tercera|tercer)\s+(?:de\s+)?/i,
  );
  if (!match) return query;
  return `${ORDINAL_TO_DIGIT[match[1].toLowerCase()]} ${query.slice(match[0].length)}`;
}

// Accepts compact typing ("jn3:16"), a trailing period on abbreviations
// ("Jn. 3:16"), ":" "." or "," as the chapter-verse separator, and "-" or
// "al" as the verse-range separator. Numbers are length-bounded so an absurd
// value fails the match here instead of reaching the database as a query error.
const REFERENCE_PATTERN =
  /^(\d\s*)?([a-záéíóúüñ]+)\.?(?:\s*(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*(?:-|al)\s*(\d{1,3}))?)?)?$/i;

/**
 * Classifies intent as book ("Apocalipsis"), chapter ("Salmos 23") or verse
 * ("Jn 3:16", "jn3:16", "Jn. 3:16", "Juan 3.16", "Juan 3,16",
 * "Juan 3:16 al 18"). Returns null when the query is free text.
 *
 * Books resolve to their canonical 1..66 position so the result never depends on
 * how a translation names them.
 */
export function parseQueryReference(query: string): ParsedReference | null {
  const normalized = spellOutOrdinalPrefix(query.trim());
  const match = normalized.match(REFERENCE_PATTERN);
  if (!match) return null;

  const [, prefix, bookRaw, chapterRaw, verseStartRaw, verseEndRaw] = match;
  const resolution = resolveBook(`${prefix ?? ""} ${bookRaw}`);
  if (resolution.status !== "resolved") return null;

  const { order: bookOrder } = resolution.entry;

  if (!chapterRaw) return { kind: "book", bookOrder };

  const chapter = parseInt(chapterRaw, 10);
  if (!verseStartRaw) return { kind: "chapter", bookOrder, chapter };

  return {
    kind: "verse",
    bookOrder,
    chapter,
    verseStart: parseInt(verseStartRaw, 10),
    verseEnd: verseEndRaw ? parseInt(verseEndRaw, 10) : undefined,
  };
}