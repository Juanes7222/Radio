import { useEffect, useState } from 'react';
import type { BibleVerse } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';
import { pickVerseText, verseReference } from '@/lib/dailyVerse';
import { getBogotaDayOfWeek } from '@/lib/time';

interface Passage {
  book: string;
  chapter: number;
  verse: number;
}

/**
 * One passage per day of the week, in the station's timezone.
 *
 * The list is fixed on purpose: a verse that came from the Bible rotation
 * would tie this screen to an event that ends, and the app would have to be
 * updated the day it does.
 */
const PASSAGES: Passage[] = [
  { book: 'Salmos', chapter: 23, verse: 1 },
  { book: 'Proverbios', chapter: 3, verse: 5 },
  { book: 'Isaías', chapter: 40, verse: 31 },
  { book: 'Juan', chapter: 14, verse: 6 },
  { book: 'Romanos', chapter: 12, verse: 2 },
  { book: 'Filipenses', chapter: 4, verse: 13 },
  { book: 'Josué', chapter: 1, verse: 9 },
];

interface DailyVerse {
  reference: string;
  text: string;
}

/**
 * The passage of the day, or null while it loads and if it cannot be fetched.
 * A missing verse is not an error the listener has to know about: the screen
 * simply starts without it.
 */
export function useDailyVerse(): DailyVerse | null {
  const [verse, setVerse] = useState<DailyVerse | null>(null);

  useEffect(() => {
    let active = true;
    const passage = PASSAGES[getBogotaDayOfWeek(new Date())];

    fetch(
      `${BACKEND_URL}/api/bible/chapter?translation=RVR1960&book=${encodeURIComponent(passage.book)}&chapter=${passage.chapter}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { verses?: BibleVerse[] } | null) => {
        if (!active || !data?.verses) return;
        const text = pickVerseText(data.verses, passage.verse);
        if (!text) return;
        setVerse({
          reference: verseReference(passage.book, passage.chapter, passage.verse),
          text,
        });
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return verse;
}
