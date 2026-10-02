/**
 * Static catalog of the 66 biblical books.
 *
 * Books are identified by `order` (1..66, matching `BibleBook.order`), never by
 * name: the canonical name stored in the database comes from the imported XML
 * and changes with the translation, while the position is language-independent.
 */

export interface BookCatalogEntry {
  /** Canonical position, 1..66. Matches `BibleBook.order`. */
  order: number;
  /** Canonical name as written by the seed for the default translation. */
  name: string;
  /** Abbreviations, alternate spellings and alternate-language names. */
  aliases: string[];
}

export const BOOK_CATALOG: readonly BookCatalogEntry[] = [
  { order: 1, name: "Génesis", aliases: ["gen", "genesis"] },
  { order: 2, name: "Éxodo", aliases: ["exo", "exodus"] },
  { order: 3, name: "Levítico", aliases: ["lev", "levitico"] },
  { order: 4, name: "Números", aliases: ["num", "numbers"] },
  { order: 5, name: "Deuteronomio", aliases: ["deu", "dt", "deut"] },
  { order: 6, name: "Josué", aliases: ["jos", "josue", "joshua"] },
  { order: 7, name: "Jueces", aliases: ["jue", "judges"] },
  { order: 8, name: "Rut", aliases: ["rut", "ruth"] },
  { order: 9, name: "1 Samuel", aliases: ["1sam", "1samuel"] },
  { order: 10, name: "2 Samuel", aliases: ["2sam", "2samuel"] },
  { order: 11, name: "1 Reyes", aliases: ["1rey", "1re", "1kings"] },
  { order: 12, name: "2 Reyes", aliases: ["2rey", "2re", "2kings"] },
  { order: 13, name: "1 Crónicas", aliases: ["1cr", "1cro", "1chron", "1 chronicles"] },
  { order: 14, name: "2 Crónicas", aliases: ["2cr", "2cro", "2chron", "2 chronicles"] },
  { order: 15, name: "Esdras", aliases: ["esd", "ezra"] },
  { order: 16, name: "Nehemías", aliases: ["neh", "nehemias"] },
  { order: 17, name: "Ester", aliases: ["est", "esther"] },
  { order: 18, name: "Job", aliases: [] },
  { order: 19, name: "Salmos", aliases: ["sal", "salmo", "ps", "psa", "psalm", "psalms"] },
  { order: 20, name: "Proverbios", aliases: ["pro", "prov", "proverbs"] },
  { order: 21, name: "Eclesiastés", aliases: ["ecl", "qoh", "ecclesiastes"] },
  { order: 22, name: "Cantares", aliases: ["cnt", "cant", "can", "song", "cantar"] },
  { order: 23, name: "Isaías", aliases: ["isa", "is", "isaiah"] },
  { order: 24, name: "Jeremías", aliases: ["jer", "jeremias", "jeremiah"] },
  { order: 25, name: "Lamentaciones", aliases: ["lam"] },
  { order: 26, name: "Ezequiel", aliases: ["eze", "ezq", "ezequiel"] },
  { order: 27, name: "Daniel", aliases: ["dan", "dnl"] },
  { order: 28, name: "Oseas", aliases: ["ose", "hos", "hosea"] },
  { order: 29, name: "Joel", aliases: ["joe", "jl"] },
  { order: 30, name: "Amós", aliases: ["amo", "am"] },
  { order: 31, name: "Abdías", aliases: ["abd", "ob", "obadias"] },
  { order: 32, name: "Jonás", aliases: ["jon", "jonas"] },
  { order: 33, name: "Miqueas", aliases: ["miq", "mic"] },
  { order: 34, name: "Nahúm", aliases: ["nah", "nahum"] },
  { order: 35, name: "Habacuc", aliases: ["hab", "habakkuk"] },
  { order: 36, name: "Sofonías", aliases: ["sof", "zep", "zephaniah"] },
  { order: 37, name: "Hageo", aliases: ["hag", "haggai"] },
  { order: 38, name: "Zacarías", aliases: ["zac", "zech", "zechariah"] },
  { order: 39, name: "Malaquías", aliases: ["mal", "malachi"] },
  { order: 40, name: "Mateo", aliases: ["mat", "mt", "matt", "matthew"] },
  { order: 41, name: "Marcos", aliases: ["mar", "mc", "mk", "mark"] },
  { order: 42, name: "Lucas", aliases: ["luc", "lk", "luke"] },
  { order: 43, name: "Juan", aliases: ["jn", "jua", "john"] },
  { order: 44, name: "Hechos", aliases: ["hch", "act", "acts"] },
  { order: 45, name: "Romanos", aliases: ["rom", "ro", "romans"] },
  { order: 46, name: "1 Corintios", aliases: ["1co", "1cor", "1corinthians"] },
  { order: 47, name: "2 Corintios", aliases: ["2co", "2cor", "2corinthians"] },
  { order: 48, name: "Gálatas", aliases: ["gal", "ga", "galatians"] },
  { order: 49, name: "Efesios", aliases: ["efe", "ef", "ephesians"] },
  { order: 50, name: "Filipenses", aliases: ["fil", "php", "philippians"] },
  { order: 51, name: "Colosenses", aliases: ["col", "colosenses", "colossians"] },
  { order: 52, name: "1 Tesalonicenses", aliases: ["1tes", "1ts", "1thess"] },
  { order: 53, name: "2 Tesalonicenses", aliases: ["2tes", "2ts", "2thess"] },
  { order: 54, name: "1 Timoteo", aliases: ["1ti", "1tim", "1timothy"] },
  { order: 55, name: "2 Timoteo", aliases: ["2ti", "2tim", "2timothy"] },
  { order: 56, name: "Tito", aliases: ["tit", "titus"] },
  { order: 57, name: "Filemón", aliases: ["flm", "phm", "philemon"] },
  { order: 58, name: "Hebreos", aliases: ["heb", "hebrews"] },
  { order: 59, name: "Santiago", aliases: ["san", "stg", "jas", "james"] },
  { order: 60, name: "1 Pedro", aliases: ["1pe", "1ped", "1pet", "1peter"] },
  { order: 61, name: "2 Pedro", aliases: ["2pe", "2ped", "2pet", "2peter"] },
  { order: 62, name: "1 Juan", aliases: ["1jn", "1jo", "1john"] },
  { order: 63, name: "2 Juan", aliases: ["2jn", "2jo", "2john"] },
  { order: 64, name: "3 Juan", aliases: ["3jn", "3jo", "3john"] },
  { order: 65, name: "Judas", aliases: ["jud", "jude"] },
  { order: 66, name: "Apocalipsis", aliases: ["ap", "apo", "apoc", "rev", "revelation"] },
];

export const MIN_BOOK_ORDER = 1;
export const MAX_BOOK_ORDER = 66;

/** Below this length a query is too short to disambiguate by prefix. */
export const MIN_PREFIX_LENGTH = 3;

export type BookResolution =
  | { status: "resolved"; entry: BookCatalogEntry }
  | { status: "ambiguous"; candidates: BookCatalogEntry[] }
  | { status: "unknown" };

/** Lowercases and strips diacritics and spaces so "1 S AM" and "1sam" match. */
export function normalizeBookKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

interface BookLookupIndex {
  exact: ReadonlyMap<string, BookCatalogEntry>;
  /** Keys usable as prefix sources, ordered so the best match comes first. */
  prefixKeys: ReadonlyMap<BookCatalogEntry, readonly string[]>;
}

function buildLookupIndex(): BookLookupIndex {
  const exact = new Map<string, BookCatalogEntry>();
  const prefixKeys = new Map<BookCatalogEntry, string[]>();

  for (const entry of BOOK_CATALOG) {
    const keys = [entry.name, ...entry.aliases].map(normalizeBookKey);

    for (const key of keys) {
      if (key.length === 0) continue;

      const existing = exact.get(key);
      if (existing && existing.order !== entry.order) {
        // The table is static, so a collision is a programming error. Failing
        // loudly beats silently resolving a query to the wrong book.
        throw new Error(
          `Bible book alias "${key}" maps to both order ${existing.order} and ${entry.order}`,
        );
      }
      exact.set(key, entry);
    }

    const prefixes = [...keys];

    // "corintios" has to reach "1 Corintios", so numbered keys also answer to
    // their unnumbered form. Short remainders are skipped: stripping the digit
    // off "1re" would leave "re" and make every "re..." word match Reyes.
    for (const key of keys) {
      if (!/^\d/.test(key)) continue;
      const stripped = key.replace(/^\d/, "");
      if (stripped.length >= MIN_PREFIX_LENGTH) prefixes.push(stripped);
    }

    prefixKeys.set(entry, [...new Set(prefixes)]);
  }

  return { exact, prefixKeys };
}

const LOOKUP = buildLookupIndex();

/**
 * Resolves a book name or alias to its canonical 1..66 position.
 *
 * Exact keys win first, so "jn" stays Juan instead of becoming an ambiguous
 * Juan / 1 Juan / 2 Juan / 3 Juan. Only then are prefixes considered, and a
 * prefix matching several books is reported as ambiguous rather than guessed.
 */
export function resolveBook(raw: string): BookResolution {
  const key = normalizeBookKey(raw);

  const exactMatch = LOOKUP.exact.get(key);
  if (exactMatch) return { status: "resolved", entry: exactMatch };

  if (key.length < MIN_PREFIX_LENGTH) return { status: "unknown" };

  const candidates = BOOK_CATALOG.filter((entry) =>
    LOOKUP.prefixKeys.get(entry)!.some((prefixKey) => prefixKey.startsWith(key)),
  );

  if (candidates.length === 1) return { status: "resolved", entry: candidates[0] };
  return candidates.length > 1 ? { status: "ambiguous", candidates } : { status: "unknown" };
}

export function isValidBookOrder(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_BOOK_ORDER && value <= MAX_BOOK_ORDER;
}