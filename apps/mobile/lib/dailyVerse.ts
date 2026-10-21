import type { BibleVerse } from '@radio/types';

/** "Salmos 23:1" — how a reader writes the reference. */
export function verseReference(book: string, chapter: number, verse: number): string {
  return `${book} ${chapter}:${verse}`;
}

/**
 * The text of one specific verse.
 *
 * The chapter endpoint returns every verse of the chapter, so the verse has to
 * be picked by its number: taking the first one would give Juan 14:1 when the
 * passage asked for Juan 14:6.
 */
export function pickVerseText(verses: readonly BibleVerse[], number: number): string | null {
  const found = verses.find((verse) => verse.number === number);
  const text = found?.text?.trim();
  return text ? text : null;
}
