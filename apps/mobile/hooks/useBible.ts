import { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BibleQueryResponse, BibleTranslation, BibleBook, BibleSearchResult } from '@radio/types';
import { BACKEND_URL } from '@/constants/api';

const API_BASE = `${BACKEND_URL}/api/bible`;
const READING_KEY = 'bible-reading-position';

// Bible content is static between imports, so caching it locally avoids
// re-downloading entire books on every visit.
const BIBLE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const CACHE_PREFIX = 'bible-cache-v1';

async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { timestamp: number; data: T };
    if (
      typeof parsed.timestamp !== 'number' ||
      Date.now() - parsed.timestamp > BIBLE_CACHE_TTL_MS
    ) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

async function setCachedData<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_PREFIX}:${key}`,
      JSON.stringify({ timestamp: Date.now(), data }),
    );
  } catch {
    // Ignore storage failures
  }
}

interface SavedReadingPosition {
  translation?: string;
  book?: string;
  chapter?: number;
}

export function useBible() {
  const [translations, setTranslations] = useState<BibleTranslation[]>([]);
  const [books, setBooks] = useState<BibleBook[]>([]);
  
  const [currentTranslation, setCurrentTranslation] = useState<string>('RVR1960');
  const [currentBook, setCurrentBook] = useState<string>('Génesis');
  const [currentChapter, setCurrentChapter] = useState<number>(1);
  
  const [chapterData, setChapterData] = useState<BibleQueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savedTranslationRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);

  // Restore the last reading position so the user keeps their place.
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(READING_KEY).then((raw) => {
      if (!mounted || !raw) {
        hydratedRef.current = true;
        return;
      }
      try {
        const saved = JSON.parse(raw) as SavedReadingPosition;
        if (typeof saved.translation === 'string') {
          savedTranslationRef.current = saved.translation;
          setCurrentTranslation(saved.translation);
        }
        if (typeof saved.book === 'string') setCurrentBook(saved.book);
        if (typeof saved.chapter === 'number') setCurrentChapter(saved.chapter);
      } catch {
        // Ignore corrupted storage
      }
      hydratedRef.current = true;
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist the position on every change (once hydration finished).
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(
      READING_KEY,
      JSON.stringify({
        translation: currentTranslation,
        book: currentBook,
        chapter: currentChapter,
      } as SavedReadingPosition),
    ).catch(() => {});
  }, [currentTranslation, currentBook, currentChapter]);

  const searchBible = async (query: string): Promise<BibleSearchResult[]> => {
    try {
      const res = await fetch(
        `${API_BASE}/search?translation=${currentTranslation}&q=${encodeURIComponent(query)}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.results ?? []);
    } catch (err) {
      console.error('Error searching:', err);
      return [];
    }
  };

  // Fetch books
  useEffect(() => {
    async function loadBooks() {
      const cacheKey = `books:${currentTranslation}`;
      const cached = await getCachedData<BibleBook[]>(cacheKey);
      if (cached) {
        setBooks(cached);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/books?translation=${currentTranslation}`);
        if (res.ok) {
          const data = await res.json();
          setBooks(data);
          await setCachedData(cacheKey, data);
        }
      } catch (err) {
        console.error('Error fetching books:', err);
      }
    }
    loadBooks();
  }, [currentTranslation]);

  useEffect(() => {
    async function loadData() {
      const cacheKey = `chapter:${currentTranslation}:${currentBook}:${currentChapter}`;
      const cached = await getCachedData<BibleQueryResponse>(cacheKey);
      if (cached) {
        setChapterData(cached);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/chapter?translation=${currentTranslation}&book=${currentBook}&chapter=${currentChapter}`);
        if (res.ok) {
           const data = await res.json();
           setChapterData(data);
           await setCachedData(cacheKey, data);
        } else {
           // Si no encuentra los datos, será porque no hemos sembrado la Base de Datos
           console.warn('DB might not be seeded yet.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error fetching bible');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadData();
  }, [currentTranslation, currentBook, currentChapter]);

  useEffect(() => {
    async function loadTranslations() {
      const cached = await getCachedData<BibleTranslation[]>('translations');
      if (cached) {
        setTranslations(cached);
        if (cached.length > 0 && !savedTranslationRef.current) {
          setCurrentTranslation(cached[0].abbreviation);
        }
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/translations`);

        if (res.ok) {
          const data = await res.json();

          setTranslations(data);
          await setCachedData('translations', data);

          if (data.length > 0 && !savedTranslationRef.current) {
            setCurrentTranslation(data[0].abbreviation);
          }
        }
      } catch (err) {
        console.error('Error fetching translations:', err);
      }
    }

    loadTranslations();
  }, []);

  return {
    translations,
    books,
    currentTranslation,
    currentBook,
    currentChapter,
    chapterData,
    isLoading,
    error,
    actions: {
      setTranslation: setCurrentTranslation,
      setBook: setCurrentBook,
      setChapter: setCurrentChapter,
      nextChapter: () => {
        const bookIndex = books.findIndex(b => b.name === currentBook);
        if (bookIndex === -1) return;
        const maxChapters = books[bookIndex]._count?.chapters || 1;
        if (currentChapter < maxChapters) {
          setCurrentChapter(currentChapter + 1);
        } else if (bookIndex < books.length - 1) {
          setCurrentBook(books[bookIndex + 1].name);
          setCurrentChapter(1);
        }
      },
      prevChapter: () => {
        if (currentChapter > 1) {
          setCurrentChapter(currentChapter - 1);
        } else {
          const bookIndex = books.findIndex(b => b.name === currentBook);
          if (bookIndex > 0) {
            const prevBook = books[bookIndex - 1];
            setCurrentBook(prevBook.name);
            setCurrentChapter(prevBook._count?.chapters || 1);
          }
        }
      },
      searchBible,
    }
  };
}