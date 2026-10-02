import { Router, type Request, type Response } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { getTodayReading } from "../rotation/rotation.service";
import { asyncHandler } from "../../shared/errors/async-handler";
import { logger } from "../../shared/logger/logger";
import { isValidBookOrder } from "./bookCatalog";
import { parseQueryReference } from "./reference-parser";

const router = Router();

// Bible content is static between imports, so it can be cached aggressively
// by CDNs and browsers (the client also mirrors it with a local TTL).
function setStaticCache(res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=86400");
}

function setShortCache(res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=300");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Book selector for the read-only endpoints: either the language-independent
 * position or a name, which clients holding a `BibleBook` already have.
 */
type BookSelector = { order: number } | { name: string };

function parseBookSelector(rawOrder: unknown, rawName: unknown): BookSelector | null {
  if (rawOrder !== undefined) {
    // Number(null) and Number("") are 0, which fails the range check.
    const order = Number(asString(rawOrder));
    return isValidBookOrder(order) ? { order } : null;
  }

  const name = asString(rawName);
  return name ? { name } : null;
}

function bookWhereClause(selector: BookSelector, translationAbbr: string) {
  const translation = { abbreviation: translationAbbr };
  return "order" in selector
    ? { order: selector.order, translation }
    : { name: selector.name, translation };
}

function buildFtsQuery(terms: string[], mode: "AND" | "OR"): string {
  // Quoting each term as a prefix phrase sidesteps FTS5 operator syntax
  // (AND, OR, NOT, hyphens) while still ranking with BM25.
  const quoted = terms.map((term) => `"${term.replace(/"/g, '""')}"*`);
  return mode === "AND" ? quoted.join(" ") : quoted.join(" OR ");
}

interface FtsRow {
  verse_id: string;
  snippet: string;
  rank: number;
}

// Mirrors BibleMatchMode on @radio/types: whether the full-text branch found
// every term ("all") or had to widen the query ("any").
type MatchMode = "all" | "any";

async function runFullTextSearch(ftsQuery: string, translationAbbr: string): Promise<FtsRow[]> {
  return prisma.$queryRaw<FtsRow[]>`
    SELECT verse_id,
           snippet(bible_verse_fts, 1, '', '', '…', 8) AS snippet,
           bm25(bible_verse_fts) AS rank
    FROM bible_verse_fts
    JOIN "BibleVerse" ON "BibleVerse".id = bible_verse_fts.verse_id
    JOIN "BibleChapter" ON "BibleChapter".id = "BibleVerse".chapterId
    JOIN "BibleBook" ON "BibleBook".id = "BibleChapter".bookId
    JOIN "BibleTranslation" ON "BibleTranslation".id = "BibleBook".translationId
    WHERE bible_verse_fts MATCH ${ftsQuery}
      AND "BibleTranslation".abbreviation = ${translationAbbr}
    ORDER BY rank ASC
    LIMIT 50
  `;
}

async function fetchRankedVerses(ftsRows: FtsRow[], translationAbbr: string) {
  const rankById = new Map(ftsRows.map((row) => [row.verse_id, row]));

  const verses = await prisma.bibleVerse.findMany({
    where: {
      id: { in: [...rankById.keys()] },
      chapter: { book: { translation: { abbreviation: translationAbbr } } },
    },
    include: { chapter: { include: { book: true } } },
  });

  return verses
    .sort((a, b) => rankById.get(a.id)!.rank - rankById.get(b.id)!.rank)
    .map((verse) => ({ ...verse, snippet: rankById.get(verse.id)!.snippet }));
}

// Shared lookup between GET /chapter and the chapter intent of GET /search.
async function getChapterWithVerses(selector: BookSelector, chapterNumber: number, translationAbbr: string) {
  return prisma.bibleChapter.findFirst({
    where: {
      number: chapterNumber,
      book: bookWhereClause(selector, translationAbbr),
    },
    include: {
      book: { include: { translation: true } },
      verses: { orderBy: { number: "asc" } },
    },
  });
}

// Scheduled Bible reading: returns the chapters played today by the active
// Bible rotation, when there is one.
router.get(
  "/reading/today",
  asyncHandler(async (_req: Request, res: Response) => {
    setShortCache(res);
    const reading = await getTodayReading();
    if (!reading) {
      return res.json({ reading: null });
    }
    res.json({ reading });
  }),
);

router.get(
  "/translations",
  asyncHandler(async (_req: Request, res: Response) => {
    setStaticCache(res);
    const translations = await prisma.bibleTranslation.findMany({
      orderBy: { abbreviation: "asc" },
    });
    res.json(translations);
  }),
);

router.get(
  "/books",
  asyncHandler(async (req: Request, res: Response) => {
    setStaticCache(res);
    if (req.query.translation !== undefined && asString(req.query.translation) === null) {
      return res.status(400).json({ error: "Invalid translation parameter" });
    }
    const translationAbbr = asString(req.query.translation) ?? "RVR1960";

    const books = await prisma.bibleBook.findMany({
      where: { translation: { abbreviation: translationAbbr } },
      include: { _count: { select: { chapters: true } } },
      orderBy: { order: "asc" },
    });
    res.json(books);
  }),
);

router.get(
  "/chapters",
  asyncHandler(async (req: Request, res: Response) => {
    setStaticCache(res);
    if (req.query.translation !== undefined && asString(req.query.translation) === null) {
      return res.status(400).json({ error: "Invalid translation parameter" });
    }
    const translationAbbr = asString(req.query.translation) ?? "RVR1960";

    const selector = parseBookSelector(req.query.order, req.query.book);
    if (!selector) {
      return res.status(400).json({ error: "A valid book order or book parameter is required" });
    }

    const chapters = await prisma.bibleChapter.findMany({
      where: {
        book: bookWhereClause(selector, translationAbbr),
      },
      orderBy: { number: "asc" },
    });
    res.json(chapters);
  }),
);

router.get(
  "/chapter",
  asyncHandler(async (req: Request, res: Response) => {
    setStaticCache(res);
    if (req.query.translation !== undefined && asString(req.query.translation) === null) {
      return res.status(400).json({ error: "Invalid translation parameter" });
    }
    const translationAbbr = asString(req.query.translation) ?? "RVR1960";

    const selector = parseBookSelector(req.query.order, req.query.book);
    const chapterRaw = asString(req.query.chapter);
    if (!selector || !chapterRaw) {
      return res.status(400).json({ error: "Book and chapter parameters are required" });
    }

    const chapterNumber = parseInt(chapterRaw, 10);
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      return res.status(400).json({ error: "Invalid chapter parameter" });
    }

    const chapterData = await getChapterWithVerses(selector, chapterNumber, translationAbbr);

    if (!chapterData) {
      return res.status(404).json({ error: "Chapter not found" });
    }

    res.json({
      translation: chapterData.book.translation,
      book: chapterData.book,
      chapter: chapterData.number,
      verses: chapterData.verses,
    });
  }),
);

router.get(
  "/search",
  asyncHandler(async (req: Request, res: Response) => {
    if (req.query.translation !== undefined && asString(req.query.translation) === null) {
      return res.status(400).json({ error: "Invalid translation parameter" });
    }
    const translationAbbr = asString(req.query.translation) ?? "RVR1960";

    const q = asString(req.query.q);
    if (!q) {
      return res.status(400).json({ error: "Search query is required" });
    }

    const reference = parseQueryReference(q);

    if (reference) {
      const bookOrder = reference.bookOrder;
      const bookSelector: BookSelector = { order: bookOrder };

      if (reference.kind === "book") {
        const book = await prisma.bibleBook.findFirst({
          where: bookWhereClause(bookSelector, translationAbbr),
          include: {
            chapters: { orderBy: { number: "asc" }, select: { number: true } },
          },
        });
        if (!book) {
          return res.status(404).json({ error: "Book not found" });
        }
        const { chapters, ...bookData } = book;
        return res.json({
          type: "book",
          book: { ...bookData, _count: { chapters: chapters.length } },
          chapters: chapters.map((chapter) => chapter.number),
        });
      }

      if (reference.kind === "chapter") {
        const chapterData = await getChapterWithVerses(bookSelector, reference.chapter, translationAbbr);
        if (!chapterData) return res.status(404).json({ error: "Chapter not found" });
        return res.json({
          type: "chapter",
          translation: chapterData.book.translation,
          book: chapterData.book,
          chapter: chapterData.number,
          verses: chapterData.verses,
        });
      }

      if (reference.verseEnd !== undefined && reference.verseEnd < reference.verseStart) {
        return res.status(400).json({ error: "Invalid verse range: end must be >= start" });
      }

      const verseFilter = reference.verseEnd
        ? { gte: reference.verseStart, lte: reference.verseEnd }
        : reference.verseStart;

      const verses = await prisma.bibleVerse.findMany({
        where: {
          number: verseFilter,
          chapter: {
            number: reference.chapter,
            book: bookWhereClause(bookSelector, translationAbbr),
          },
        },
        include: {
          chapter: { include: { book: { include: { translation: true } } } },
        },
        orderBy: { number: "asc" },
      });

      if (verses.length === 0) {
        return res.status(404).json({ error: "Verse not found" });
      }

      return res.json({
        type: "reference",
        reference: {
          // Read back from the database: the name is the translation's, not the
          // catalog's, since resolution now happens by position.
          book: verses[0].chapter.book.name,
          chapter: reference.chapter,
          verseStart: reference.verseStart,
          verseEnd: reference.verseEnd,
        },
        results: verses,
      });
    }

    // Guard against single-character full-text queries that would match almost everything
    if (q.length < 2) {
      return res.status(400).json({ error: "Search query too short (minimum 2 characters)" });
    }

    // Full-text branch: try FTS5 with BM25 ranking and a plain-text excerpt.
    // Falls back to LIKE search if the virtual table is unavailable (e.g. migration not yet applied).
    const terms = q.split(/\s+/).filter(Boolean);
    try {
      let ftsRows = await runFullTextSearch(buildFtsQuery(terms, "AND"), translationAbbr);
      let matchMode: MatchMode = "all";

      // People often misremember one word of a verse; widen the search instead
      // of returning nothing.
      if (ftsRows.length === 0 && terms.length > 1) {
        ftsRows = await runFullTextSearch(buildFtsQuery(terms, "OR"), translationAbbr);
        matchMode = "any";
      }

      if (ftsRows.length === 0) {
        return res.json({ type: "fulltext", matchMode, results: [] });
      }

      const results = await fetchRankedVerses(ftsRows, translationAbbr);

      return res.json({ type: "fulltext", matchMode, results });
    } catch (err) {
      // FTS5 unavailable or query syntax error — log and fall through to LIKE fallback
      logger.warn("Bible", "FTS5 query failed, falling back to LIKE", {
        error: err instanceof Error ? err.message : String(err),
        query: q,
      });
    }

    const verses = await prisma.bibleVerse.findMany({
      where: {
        text: { contains: q },
        chapter: {
          book: { translation: { abbreviation: translationAbbr } },
        },
      },
      include: {
        chapter: { include: { book: true } },
      },
      take: 50,
    });

    res.json({ type: "fulltext", matchMode: "all" as const, results: verses });
  }),
);

export default router;
