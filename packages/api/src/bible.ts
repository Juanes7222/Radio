/**
 * Standalone, hook-free helpers for the Bible search endpoint, shared by the
 * web and mobile clients so both consume the same discriminated contract.
 */
import axios from 'axios';
import type {
  BibleBook,
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
        value.chapters.every((chapter) => typeof chapter === 'number')
      );
    case 'chapter':
      return isBook(value.book) && typeof value.chapter === 'number' && isVerseList(value.verses);
    case 'reference':
      return isResultList(value.results);
    case 'fulltext':
      return (value.matchMode === 'all' || value.matchMode === 'any') && isResultList(value.results);
    default:
      return false;
  }
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