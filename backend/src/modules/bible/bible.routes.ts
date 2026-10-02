import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
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

const FULL_TEXT_RESULT_LIMIT = 50;

/** Verse hits shown next to a book card, where they are secondary to the chapters. */
const SUPPLEMENTARY_RESULT_LIMIT = 12;

async function runFullTextSearch(
  ftsQuery: string,
  translationAbbr: string,
  limit: number,
): Promise<FtsRow[]> {
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
    LIMIT ${limit}
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

type FullTextVerse = Prisma.BibleVerseGetPayload<{
  include: { chapter: { include: { book: true } } };
}>;

interface FullTextOutcome {
  matchMode: MatchMode;
  results: FullTextVerse[];
}

/**
 * BM25-ranked search with an AND pass, widened to OR when one term was
 * misremembered. Falls back to LIKE when the virtual table is unavailable, which
 * is why both paths must return the same shape.
 */
async function searchFullText(
  terms: string[],
  translationAbbr: string,
  limit: number,
): Promise<FullTextOutcome> {
  try {
    let ftsRows = await runFullTextSearch(buildFtsQuery(terms, "AND"), translationAbbr, limit);
    let matchMode: MatchMode = "all";

    if (ftsRows.length === 0 && terms.length > 1) {
      ftsRows = await runFullTextSearch(buildFtsQuery(terms, "OR"), translationAbbr, limit);
      matchMode = "any";
    }

    if (ftsRows.length === 0) return { matchMode, results: [] };

    return { matchMode, results: await fetchRankedVerses(ftsRows, translationAbbr) };
  } catch (err) {
    logger.warn("Bible", "FTS5 query failed, falling back to LIKE", {
      error: err instanceof Error ? err.message : String(err),
      terms,
    });

    const verses = await prisma.bibleVerse.findMany({
      where: {
        text: { contains: terms.join(" ") },
        chapter: { book: { translation: { abbreviation: translationAbbr } } },
      },
      include: { chapter: { include: { book: true } } },
      take: limit,
    });

    return { matchMode: "all", results: verses };
  }
}

/** Loads books with their chapter numbers, keeping the catalog ordering. */
async function loadBookCandidates(orders: number[], translationAbbr: string) {
  const books = await prisma.bibleBook.findMany({
    where: { order: { in: orders }, translation: { abbreviation: translationAbbr } },
    include: { chapters: { orderBy: { number: "asc" }, select: { number: true } } },
  });

  const chaptersByOrder = new Map(
    books.map((book) => [book.order, book.chapters.map((chapter) => chapter.number)]),
  );
  const nameByOrder = new Map(books.map((book) => [book.order, book]));

  // A book may be absent from a given translation, so the candidate list is
  // filtered to what actually loaded.
  return orders.flatMap((order) => {
    const book = nameByOrder.get(order);
    const chapters = chaptersByOrder.get(order);
    return book && chapters ? [{ book, chapters }] : [];
  });
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

    const terms = q.split(/\s+/).filter(Boolean);
    const reference = parseQueryReference(q);

    /** Verse hits for a bare book word, so "sal" still surfaces Salmos passages. */
    const supplementary = async (bookQuery: string) =>
      searchFullText([bookQuery], translationAbbr, SUPPLEMENTARY_RESULT_LIMIT);

    if (reference?.kind === "ambiguous") {
      const candidates = await loadBookCandidates(
        reference.candidates.map((candidate) => candidate.order),
        translationAbbr,
      );

      if (candidates.length > 0) {
        return res.json({
          type: "ambiguous",
          candidates,
          ...(await supplementary(reference.bookQuery)),
        });
      }
    } else if (reference) {
      if (reference.kind === "book") {
        const [candidate] = await loadBookCandidates([reference.bookOrder], translationAbbr);
        if (!candidate) {
          return res.status(404).json({ error: "Book not found" });
        }
        return res.json({
          type: "book",
          book: { ...candidate.book, _count: { chapters: candidate.chapters.length } },
          chapters: candidate.chapters,
          ...(await supplementary(reference.bookQuery)),
        });
      }

      const bookSelector: BookSelector = { order: reference.bookOrder };

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

    res.json({
      type: "fulltext",
      ...(await searchFullText(terms, translationAbbr, FULL_TEXT_RESULT_LIMIT)),
    });
  }),
);

export default router;
