import { useState, useEffect } from 'react';
import type { BibleQueryResponse, BibleTranslation, BibleBook } from '@radio/types';

const API_BASE = '/api/bible';

export function useBible() {
  const [translations, setTranslations] = useState<BibleTranslation[]>([]);
  const [books, setBooks] = useState<BibleBook[]>([]);
  
  const [currentTranslation, setCurrentTranslation] = useState<string>('RVR1960');
  const [currentBook, setCurrentBook] = useState<string>('Génesis');
  const [currentChapter, setCurrentChapter] = useState<number>(1);
  
  const [chapterData, setChapterData] = useState<BibleQueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch books
  useEffect(() => {
    async function loadBooks() {
      try {
        const res = await fetch(`${API_BASE}/books?translation=${currentTranslation}`);
        if (res.ok) {
          const data = await res.json();
          setBooks(data);
        }
      } catch (err) {
        console.error('Error fetching books:', err);
      }
    }
    loadBooks();
  }, [currentTranslation]);

  useEffect(() => {
    // Initial fetch mockup since we need to seed the DB first
    async function loadData() {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/chapter?translation=${currentTranslation}&book=${currentBook}&chapter=${currentChapter}`);
        if (res.ok) {
           const data = await res.json();
           setChapterData(data);
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
      try {
        const res = await fetch(`${API_BASE}/translations`);

        if (res.ok) {
          const data = await res.json();

          setTranslations(data);

          if (data.length > 0) {
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
      nextChapter: () => setCurrentChapter(prev => prev + 1),
      prevChapter: () => setCurrentChapter(prev => Math.max(1, prev - 1)),
    }
  };
}