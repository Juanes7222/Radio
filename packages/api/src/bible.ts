/**
 * Standalone, hook-free helpers for the Bible search endpoint, shared by the
 * web and mobile clients so both consume the same discriminated contract.
 */
import axios from 'axios';
import type {
  BibleBook,
  BibleBookCandidate,
  BibleMatchMode,
  BibleSearchResponse,
  BibleSearchResult,
  BibleVerse,
} from '@radio/types';

const TIMEOUT_MS = 10000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBook(value: unknown): value is BibleBook {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

function isVerseList(value: unknown): value is BibleVerse[] {
  return (
    Array.isArray(value) &&
    value.every(
      (verse) =>
        isRecord(verse) &&
        typeof verse.id === 'string' &&
        typeof verse.number === 'number' &&
        typeof verse.text === 'string',
    )
  );
}

function isResultList(value: unknown): value is BibleSearchResult[] {
  return (
    Array.isArray(value) &&
    value.every(
      (result) =>
        isRecord(result) &&
        typeof result.id === 'string' &&
        typeof result.number === 'number' &&
        typeof result.text === 'string' &&
        isRecord(result.chapter) &&
        typeof result.chapter.number === 'number' &&
        isRecord(result.chapter.book) &&
        typeof result.chapter.book.name === 'string',
    )
  );
}

function isMatchMode(value: unknown): value is BibleMatchMode {
  return value === 'all' || value === 'any';
}

function isCandidateList(value: unknown): value is BibleBookCandidate[] {
  return (
    Array.isArray(value) &&
    value.every(
      (candidate) =>
        isRecord(candidate) &&
        isBook(candidate.book) &&
        Array.isArray(candidate.chapters) &&
        candidate.chapters.every((chapter) => typeof chapter === 'number'),
    )
  );
}

/**
 * Validates the discriminant and the payload each branch depends on, so an
 * unexpected shape surfaces as an error instead of an empty result list.
 */
export function isBibleSearchResponse(value: unknown): value is BibleSearchResponse {
  if (!isRecord(value)) return false;

  switch (value.type) {
    case 'book':
      return (
        isBook(value.book) &&
        Array.isArray(value.chapters) &&
        value.chapters.every((chapter) => typeof chapter === 'number') &&
        isMatchMode(value.matchMode) &&
        isResultList(value.results)
      );
    case 'ambiguous':
      return (
        isCandidateList(value.candidates) &&
        isMatchMode(value.matchMode) &&
        isResultList(value.results)
      );
    case 'chapter':
      return isBook(value.book) && typeof value.chapter === 'number' && isVerseList(value.verses);
    case 'reference':
      return isResultList(value.results);
    case 'fulltext':
      return isMatchMode(value.matchMode) && isResultList(value.results);
    default:
      return false;
  }
}

export interface BibleTextSegment {
  text: string;
  matched: boolean;
}

/**
 * Case- and accent-insensitive folding, mirroring how FTS5 matches: a search for
 * "senor" must highlight "Señor" just like the index found it.
 */
function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

interface MatchRange {
  start: number;
  end: number;
}

function collectRanges(text: string, term: string, ranges: MatchRange[]): void {
  const needle = foldForSearch(term);
  if (needle.length === 0) return;

  // Slices the original string by the term's own length and compares folded
  // values, so no assumption is made about how folding changes string length.
  for (let start = 0; start + term.length <= text.length; start += 1) {
    if (foldForSearch(text.slice(start, start + term.length)) === needle) {
      ranges.push({ start, end: start + term.length });
      start += term.length - 1;
    }
  }
}

/**
 * Splits verse text into matched and unmatched segments so callers can render
 * the emphasis themselves. Returns plain strings: no HTML, so the text cannot
 * carry markup that a renderer would have to escape.
 *
 * Matching is by substring rather than by FTS token boundary, so an infix term
 * like "ñor" highlights inside "Señor" even though the index would not have
 * matched that token. Overshooting only marks text the user already asked for.
 */
export function splitBibleText(text: string, terms: string[]): BibleTextSegment[] {
  const ranges: MatchRange[] = [];
  for (const term of terms) collectRanges(text, term, ranges);
  if (ranges.length === 0) return [{ text, matched: false }];

  ranges.sort((a, b) => a.start - b.start);

  const merged: MatchRange[] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const segments: BibleTextSegment[] = [];
  let cursor = 0;
  for (const range of merged) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), matched: false });
    }
    segments.push({ text: text.slice(range.start, range.end), matched: true });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), matched: false });

  return segments;
}

function toErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body: unknown = err.response?.data;
    if (isRecord(body) && typeof body.error === 'string' && body.error) {
      return body.error;
    }
    if (err.code === 'ECONNABORTED') {
      return 'La búsqueda tardó demasiado. Intenta de nuevo.';
    }
  }
  return 'No se pudo completar la búsqueda.';
}

/**
 * Runs a Bible search and returns the response discriminated by intent. Throws
 * when the request fails so callers can tell "no matches" (a 200 with an empty
 * list) apart from a real error.
 */
export async function fetchBibleSearch(
  bibleBaseUrl: string,
  translation: string,
  query: string,
  signal?: AbortSignal
): Promise<BibleSearchResponse> {
  let data: unknown;
  try {
    const response = await axios.get<unknown>(`${bibleBaseUrl}/search`, {
      params: { translation, q: query },
      signal,
      timeout: TIMEOUT_MS,
    });
    data = response.data;
  } catch (err) {
    if (axios.isCancel(err)) throw err;
    throw new Error(toErrorMessage(err));
  }

  if (!isBibleSearchResponse(data)) {
    throw new Error('La respuesta de la búsqueda no tiene el formato esperado.');
  }
  return data;
}