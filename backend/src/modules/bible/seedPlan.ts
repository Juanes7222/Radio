import type { ParsedBible } from './bibleTranslations';

/** The number of verses a parsed Bible declares. */
export function countVerses(bible: ParsedBible): number {
  return bible.books.reduce(
    (total, book) =>
      total + book.chapters.reduce((chapters, chapter) => chapters + chapter.verses.length, 0),
    0
  );
}

/**
 * True when the database already holds the verses the file declares.
 *
 * The comparison is by count: a translation seeded with the wrong text but
 * the same number of verses is not detected here. The count is the contract
 * the deploy relies on to keep the seed cheap, not a proof of the text.
 */
export function isAlreadySeeded(expectedVerses: number, seededVerses: number): boolean {
  return expectedVerses === seededVerses;
}
