export interface BibleTranslation {
  id: string;
  abbreviation: string;
  name: string;
}

export interface BibleBook {
  id: string;
  translationId: string;
  name: string;
  abbreviation: string;
  testament: string;
  order: number;
  _count?: {
    chapters: number;
  };
}

export interface BibleChapter {
  id: string;
  bookId: string;
  number: number;
}

export interface BibleVerse {
  id: string;
  chapterId: string;
  number: number;
  text: string;
}

export interface BibleQueryResponse {
  translation: BibleTranslation;
  book: BibleBook;
  chapter: number;
  verses: BibleVerse[];
}

export interface BibleSearchResult {
  id: string;
  text: string;
  number: number;
  /**
   * Short excerpt of the verse, taken by the full-text index. Plain text: the
   * backend never emits HTML markup here, so callers must escape it themselves.
   */
  snippet?: string;
  chapter: {
    number: number;
    book: {
      name: string;
    };
  };
}

/**
 * Whether every search term had to be found (`all`) or the backend widened the
 * query to any term (`any`). Surfaced so results are not mistaken for exact
 * matches when the AND pass came back empty.
 */
export type BibleMatchMode = 'all' | 'any';

export interface BibleVerseReference {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
}

/** A bare book name, e.g. "Apocalipsis": renders a chapter picker. */
export interface BibleBookSearchResponse {
  type: 'book';
  book: BibleBook;
  chapters: number[];
}

/** A book and chapter, e.g. "Juan 3": renders every verse of that chapter. */
export interface BibleChapterSearchResponse extends BibleQueryResponse {
  type: 'chapter';
}

/** A resolved verse or verse range, e.g. "Juan 3:16" or "Juan 3:16-18". */
export interface BibleReferenceSearchResponse {
  type: 'reference';
  reference: BibleVerseReference;
  results: BibleSearchResult[];
}

/** Free text that matched no book reference. */
export interface BibleFullTextSearchResponse {
  type: 'fulltext';
  matchMode: BibleMatchMode;
  results: BibleSearchResult[];
}

/**
 * Every branch of `GET /api/bible/search`. Consumers must branch on `type`
 * instead of reading a single field, otherwise data the backend sent is
 * silently dropped.
 */
export type BibleSearchResponse =
  | BibleBookSearchResponse
  | BibleChapterSearchResponse
  | BibleReferenceSearchResponse
  | BibleFullTextSearchResponse;
