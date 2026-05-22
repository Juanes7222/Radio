import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Get all translations
router.get('/translations', async (req, res) => {
  try {
    const translations = await prisma.bibleTranslation.findMany({
      orderBy: { abbreviation: 'asc' }
    });
    res.json(translations);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching translations' });
  }
});

// Get books for a specific translation
router.get('/books', async (req, res) => {
  const { translation = 'RVR1960' } = req.query;
  
  try {
    const books = await prisma.bibleBook.findMany({
      where: {
        translation: { abbreviation: translation as string }
      },
      include: {
        _count: {
          select: { chapters: true }
        }
      },
      orderBy: { order: 'asc' }
    });
    res.json(books);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching books' });
  }
});

// Get chapters for a book
router.get('/chapters', async (req, res) => {
  const { translation = 'RVR1960', book } = req.query;
  
  if (!book) {
    return res.status(400).json({ error: 'Book parameter is required' });
  }

  try {
    const chapters = await prisma.bibleChapter.findMany({
      where: {
        book: {
          name: book as string,
          translation: { abbreviation: translation as string }
        }
      },
      orderBy: { number: 'asc' }
    });
    res.json(chapters);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching chapters' });
  }
});

// Get full chapter with verses
router.get('/chapter', async (req, res) => {
  const { translation = 'RVR1960', book, chapter } = req.query;
  
  if (!book || !chapter) {
    return res.status(400).json({ error: 'Book and chapter parameters are required' });
  }

  try {
    const chapterData = await prisma.bibleChapter.findFirst({
      where: {
        number: parseInt(chapter as string),
        book: {
          name: book as string,
          translation: { abbreviation: translation as string }
        }
      },
      include: {
        book: {
          include: {
            translation: true
          }
        },
        verses: {
          orderBy: { number: 'asc' }
        }
      }
    });

    if (!chapterData) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    res.json({
      translation: chapterData.book.translation,
      book: chapterData.book,
      chapter: chapterData.number,
      verses: chapterData.verses
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching chapter verses' });
  }
});

export default router;
