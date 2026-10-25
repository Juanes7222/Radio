import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pickVerseText, verseReference } from '../../lib/dailyVerse';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file: string) => readFileSync(join(appRoot, file), 'utf8');

const verse = (number: number, text: string) => ({
  id: `v${number}`,
  chapterId: 'c',
  number,
  text,
});

describe('daily verse', () => {
  it('names the verse the way a reader would', () => {
    expect(verseReference('Salmos', 23, 1)).toBe('Salmos 23:1');
    expect(verseReference('Juan', 14, 6)).toBe('Juan 14:6');
  });

  it('picks the verse it was asked for, not the first of the chapter', () => {
    const verses = [
      verse(1, 'En el principio era el Verbo'),
      verse(6, 'Le dijo Jesús a Marta: Yo soy la resurrección y la vida'),
    ];

    expect(pickVerseText(verses, 6)).toBe('Le dijo Jesús a Marta: Yo soy la resurrección y la vida');
    expect(pickVerseText(verses, 1)).toBe('En el principio era el Verbo');
  });

  it('returns nothing when the verse is not there', () => {
    expect(pickVerseText([], 1)).toBeNull();
    expect(pickVerseText([verse(1, '  ')], 1)).toBeNull();
    expect(pickVerseText([verse(1, 'texto')], 9)).toBeNull();
  });
});

describe('prayer screen', () => {
  it('opens with the verse of the day', () => {
    const screen = read('app/(tabs)/prayer.tsx');

    expect(screen).toMatch(/useDailyVerse/);
    expect(screen).toMatch(/verseText/);
  });

  it('keeps the companionship line in the confirmation', () => {
    const screen = read('app/(tabs)/prayer.tsx');

    expect(screen).toMatch(/Tu petición fue recibida/);
  });
});
