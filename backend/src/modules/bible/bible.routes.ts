import { Router, type Response } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { getTodayReading } from "../rotation/rotation.service";

const router = Router();

// Bible content is static between imports, so it can be cached aggressively
// by CDNs and browsers (the client also mirrors it with a local TTL).
function setStaticCache(res: Response): void {
  res.setHeader("Cache-Control", "public, max-age=86400");
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
router.get("/reading/today", async (_req, res) => {
  try {
    const reading = await getTodayReading();
    if (!reading) {
      return res.json({ reading: null });
    }
    res.json({ reading });
  } catch {
    res.status(500).json({ error: "Error fetching today's reading" });
  }
});

router.get("/translations", async (_req, res) => {
  setStaticCache(res);
  try {
    const translations = await prisma.bibleTranslation.findMany({
      orderBy: { abbreviation: "asc" },
    });
    res.json(translations);
  } catch {
    res.status(500).json({ error: "Error fetching translations" });
  }
});

router.get("/books", async (req, res) => {
  setStaticCache(res);
  const { translation = "RVR1960" } = req.query;

  try {
    const books = await prisma.bibleBook.findMany({
      where: { translation: { abbreviation: String(translation) } },
      include: { _count: { select: { chapters: true } } },
      orderBy: { order: "asc" },
    });
    res.json(books);
  } catch {
    res.status(500).json({ error: "Error fetching books" });
  }
});

router.get("/chapters", async (req, res) => {
  setStaticCache(res);
  const { translation = "RVR1960", book } = req.query;

  if (!book) {
    return res.status(400).json({ error: "Book parameter is required" });
  }

  try {
    const chapters = await prisma.bibleChapter.findMany({
      where: {
        book: {
          name: String(book),
          translation: { abbreviation: String(translation) },
        },
      },
      orderBy: { number: "asc" },
    });
    res.json(chapters);
  } catch {
    res.status(500).json({ error: "Error fetching chapters" });
  }
});

router.get("/chapter", async (req, res) => {
  setStaticCache(res);
  const { translation = "RVR1960", book, chapter } = req.query;

  if (!book || !chapter) {
    return res.status(400).json({ error: "Book and chapter parameters are required" });
  }

  try {
    const chapterData = await prisma.bibleChapter.findFirst({
      where: {
        number: parseInt(String(chapter), 10),
        book: {
          name: String(book),
          translation: { abbreviation: String(translation) },
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
  } catch {
    res.status(500).json({ error: "Error fetching chapter verses" });
  }
});

router.get("/search", async (req, res) => {
  const { translation = "RVR1960", q } = req.query;

  if (!q || typeof q !== "string" || q.trim() === "") {
    return res.status(400).json({ error: "Search query is required" });
  }

  const translationAbbr = String(translation);
  const reference = parseQueryReference(q.trim());

  try {
    if (reference) {
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

    // Full-text branch: try FTS5 with BM25 ranking and highlighted snippets.
    // Falls back to LIKE search if the virtual table is unavailable (e.g. migration not yet applied).
    try {
      const ftsQuery = buildFtsMatchQuery(q.trim());
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
      console.warn("[bible/search] FTS5 query failed, falling back to LIKE:", err instanceof Error ? err.message : err);
    }

    const verses = await prisma.bibleVerse.findMany({
      where: {
        text: { contains: q as string },
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
  } catch {
    res.status(500).json({ error: "Error searching bible" });
  }
});

export default router;
