import { Router, type Request, type Response } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { getTodayReading } from "../rotation/rotation.service";
import { asyncHandler } from "../../shared/errors/async-handler";
import { logger } from "../../shared/logger/logger";

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

// Maps common abbreviations and alternate spellings to canonical book names.
// Covers Spanish names, English names, and common abbreviations.
const BOOK_ALIASES: Record<string, string> = {
  // Pentateuch
  gen: "Génesis", gén: "Génesis", genesis: "Génesis",
  exo: "Éxodo", éxodo: "Éxodo", exodo: "Éxodo", exodus: "Éxodo",
  lev: "Levítico", levítico: "Levítico", levitico: "Levítico",
  num: "Números", números: "Números", numeros: "Números", numbers: "Números",
  deu: "Deuteronomio", dt: "Deuteronomio", deut: "Deuteronomio",
  // Historical
  jos: "Josué", josue: "Josué", josh: "Josué",
  jue: "Jueces", judges: "Jueces",
  rut: "Rut", ruth: "Rut",
  "1sam": "1 Samuel", "1 sam": "1 Samuel", "1samuel": "1 Samuel",
  "2sam": "2 Samuel", "2 sam": "2 Samuel", "2samuel": "2 Samuel",
  "1rey": "1 Reyes", "1re": "1 Reyes", "1kings": "1 Reyes",
  "2rey": "2 Reyes", "2re": "2 Reyes", "2kings": "2 Reyes",
  "1cr": "1 Crónicas", "1cro": "1 Crónicas", "1chron": "1 Crónicas",
  "2cr": "2 Crónicas", "2cro": "2 Crónicas", "2chron": "2 Crónicas",
  esd: "Esdras", ezra: "Esdras",
  neh: "Nehemías", nehemias: "Nehemías",
  est: "Ester", esther: "Ester",
  // Poetic
  job: "Job",
  sal: "Salmos", ps: "Salmos", psa: "Salmos", psalm: "Salmos", psalms: "Salmos", salmo: "Salmos",
  pro: "Proverbios", prov: "Proverbios", proverbs: "Proverbios",
  ecl: "Eclesiastés", qoh: "Eclesiastés",
  cnt: "Cantares", cant: "Cantares", song: "Cantares",
  // Prophets
  isa: "Isaías", is: "Isaías", isaiah: "Isaías", isaias: "Isaías",
  jer: "Jeremías", jeremias: "Jeremías",
  lam: "Lamentaciones",
  eze: "Ezequiel", ezq: "Ezequiel", ezekiel: "Ezequiel",
  dan: "Daniel",
  ose: "Oseas", hos: "Oseas",
  joe: "Joel", jl: "Joel",
  amo: "Amós", am: "Amós",
  abd: "Abdías", ob: "Abdías",
  jon: "Jonás", jonas: "Jonás",
  miq: "Miqueas", mic: "Miqueas",
  nah: "Nahúm", nah2: "Nahúm",
  hab: "Habacuc",
  sof: "Sofonías", zep: "Sofonías",
  hag: "Hageo",
  zac: "Zacarías", zech: "Zacarías",
  mal: "Malaquías",
  // Gospels and Acts
  mat: "Mateo", mt: "Mateo", matt: "Mateo", mateo: "Mateo", matthew: "Mateo",
  mar: "Marcos", mc: "Marcos", mk: "Marcos", mark: "Marcos", marcos: "Marcos",
  luc: "Lucas", lk: "Lucas", luke: "Lucas", lucas: "Lucas",
  jn: "Juan", jua: "Juan", john: "Juan", juan: "Juan",
  hch: "Hechos", act: "Hechos", acts: "Hechos",
  // Epistles
  rom: "Romanos", ro: "Romanos", romans: "Romanos",
  "1co": "1 Corintios", "1cor": "1 Corintios", "1 cor": "1 Corintios", "1corinthians": "1 Corintios",
  "2co": "2 Corintios", "2cor": "2 Corintios", "2 cor": "2 Corintios", "2corinthians": "2 Corintios",
  gal: "Gálatas", ga: "Gálatas", galatians: "Gálatas",
  efe: "Efesios", ef: "Efesios", eph: "Efesios", ephesians: "Efesios",
  fil: "Filipenses", php: "Filipenses", philippians: "Filipenses",
  col: "Colosenses", colosenses: "Colosenses", colossians: "Colosenses",
  "1tes": "1 Tesalonicenses", "1ts": "1 Tesalonicenses", "1thess": "1 Tesalonicenses",
  "2tes": "2 Tesalonicenses", "2ts": "2 Tesalonicenses", "2thess": "2 Tesalonicenses",
  "1ti": "1 Timoteo", "1tim": "1 Timoteo", "1timothy": "1 Timoteo",
  "2ti": "2 Timoteo", "2tim": "2 Timoteo", "2timothy": "2 Timoteo",
  tit: "Tito", titus: "Tito",
  flm: "Filemón", phm: "Filemón", philemon: "Filemón",
  heb: "Hebreos", hebrews: "Hebreos",
  san: "Santiago", stg: "Santiago", jas: "Santiago", james: "Santiago",
  "1pe": "1 Pedro", "1ped": "1 Pedro", "1pet": "1 Pedro", "1peter": "1 Pedro",
  "2pe": "2 Pedro", "2ped": "2 Pedro", "2pet": "2 Pedro", "2peter": "2 Pedro",
  "1jn": "1 Juan", "1jo": "1 Juan", "1john": "1 Juan",
  "2jn": "2 Juan", "2jo": "2 Juan", "2john": "2 Juan",
  "3jn": "3 Juan", "3jo": "3 Juan", "3john": "3 Juan",
  jud: "Judas", jude: "Judas",
  ap: "Apocalipsis", apo: "Apocalipsis", rev: "Apocalipsis", revelation: "Apocalipsis",
};

interface VerseReference {
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
}

function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

const NORMALIZED_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(BOOK_ALIASES).map(([alias, canonical]) => [normalizeKey(alias), canonical]),
);

// Falls back to the canonical name itself, so full names like "1 Corintios"
// resolve even without an explicit abbreviation entry.
const CANONICAL_BOOK_LOOKUP: Record<string, string> = Object.fromEntries(
  [...new Set(Object.values(BOOK_ALIASES))].map((name) => [normalizeKey(name), name]),
);

function resolveBookAlias(raw: string): string | null {
  const key = normalizeKey(raw);
  return NORMALIZED_ALIASES[key] ?? CANONICAL_BOOK_LOOKUP[key] ?? null;
}

/**
 * Attempts to parse a query string as a verse reference.
 * Supports formats: "Mateo 8:1", "Mt 8:1", "1Co 13:4-7", "Salmos 23"
 * Returns null when the query does not match a recognizable reference pattern.
 */
function parseQueryReference(query: string): VerseReference | null {
  // Pattern: optional number prefix + book name + chapter + optional :verse[-verse]
  // Examples: "Mateo 8:1", "1 Corintios 13:4", "Sal 23", "Jn 3:16-18"
  const pattern = /^(\d\s*)?([a-záéíóúüñ]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/i;
  const normalized = query.trim();
  const match = normalized.match(pattern);
  if (!match) return null;

  const prefix = match[1]?.trim() ?? "";
  const bookRaw = prefix ? `${prefix} ${match[2]}` : match[2];
  const chapter = parseInt(match[3], 10);
  const verseStart = match[4] ? parseInt(match[4], 10) : 1;
  const verseEnd = match[5] ? parseInt(match[5], 10) : undefined;

  const bookName = resolveBookAlias(bookRaw);
  if (!bookName) return null;

  return { bookName, chapter, verseStart, verseEnd };
}

function buildFtsMatchQuery(query: string): string {
  // Quoting each term as a prefix phrase sidesteps FTS5 operator syntax
  // (AND, OR, NOT, hyphens) while still doing implicit AND across terms.
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(" ");
}

// Lectura bíblica programada: devuelve los capítulos que se están
// reproduciendo hoy según la rotación bíblica activa, si existe.
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

    const bookName = asString(req.query.book);
    if (!bookName) {
      return res.status(400).json({ error: "Book parameter is required" });
    }

    const chapters = await prisma.bibleChapter.findMany({
      where: {
        book: {
          name: bookName,
          translation: { abbreviation: translationAbbr },
        },
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

    const bookName = asString(req.query.book);
    const chapterRaw = asString(req.query.chapter);
    if (!bookName || !chapterRaw) {
      return res.status(400).json({ error: "Book and chapter parameters are required" });
    }

    const chapterNumber = parseInt(chapterRaw, 10);
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      return res.status(400).json({ error: "Invalid chapter parameter" });
    }

    const chapterData = await prisma.bibleChapter.findFirst({
      where: {
        number: chapterNumber,
        book: {
          name: bookName,
          translation: { abbreviation: translationAbbr },
        },
      },
      include: {
        book: { include: { translation: true } },
        verses: { orderBy: { number: "asc" } },
      },
    });

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
            book: {
              name: reference.bookName,
              translation: { abbreviation: translationAbbr },
            },
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
          book: reference.bookName,
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

    // Full-text branch: try FTS5 with BM25 ranking and highlighted snippets.
    // Falls back to LIKE search if the virtual table is unavailable (e.g. migration not yet applied).
    try {
      const ftsQuery = buildFtsMatchQuery(q);
      if (ftsQuery) {
        const ftsRows = await prisma.$queryRaw<{ verse_id: string; snippet: string; rank: number }[]>`
          SELECT verse_id,
                 snippet(bible_verse_fts, 1, '<mark>', '</mark>', '…', 8) AS snippet,
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

        if (ftsRows.length === 0) {
          return res.json({ type: "fulltext", results: [] });
        }

        const rankById = new Map(ftsRows.map((row) => [row.verse_id, row]));

        const verses = await prisma.bibleVerse.findMany({
          where: {
            id: { in: [...rankById.keys()] },
            chapter: { book: { translation: { abbreviation: translationAbbr } } },
          },
          include: { chapter: { include: { book: true } } },
        });

        const results = verses
          .sort((a, b) => rankById.get(a.id)!.rank - rankById.get(b.id)!.rank)
          .map((verse) => ({ ...verse, snippet: rankById.get(verse.id)!.snippet }));

        return res.json({ type: "fulltext", results });
      }
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

    res.json({ type: "fulltext", results: verses });
  }),
);

export default router;
