import { XMLParser } from "fast-xml-parser";

/**
 * A Bible translation the station is allowed to redistribute.
 *
 * The XML files live in the `packages/assets/bible/Holy-Bible-XML-Format`
 * submodule and carry the copyright notice in their own header.
 */
export interface BibleTranslationSource {
  readonly abbreviation: string;
  readonly name: string;
  readonly file: string;
}

/** Reina-Valera Gómez 2004, the translation the published pages are built from. */
export const PUBLISHED_TRANSLATION: BibleTranslationSource = {
  abbreviation: "RVG2004",
  name: "Reina-Valera Gómez 2004",
  file: "SpanishRVGBible.xml",
};

export interface ParsedVerse {
  readonly number: number;
  readonly text: string;
}

export interface ParsedChapter {
  readonly number: number;
  readonly verses: ParsedVerse[];
}

export interface ParsedBook {
  readonly number: number;
  readonly name: string;
  readonly testament: "AT" | "NT";
  readonly chapters: ParsedChapter[];
}

export interface ParsedBible {
  readonly books: ParsedBook[];
}

/**
 * The 66 book names in canonical order.
 *
 * Index 0 is unused so index 1 is Genesis, which is the number the XML files
 * carry in each `<book number="...">`.
 */
export const BIBLE_BOOK_NAMES: readonly string[] = [
  "", "Génesis", "Éxodo", "Levítico", "Números", "Deuteronomio", "Josué", "Jueces", "Rut",
  "1 Samuel", "2 Samuel", "1 Reyes", "2 Reyes", "1 Crónicas", "2 Crónicas", "Esdras", "Nehemías",
  "Ester", "Job", "Salmos", "Proverbios", "Eclesiastés", "Cantares", "Isaías", "Jeremías",
  "Lamentaciones", "Ezequiel", "Daniel", "Oseas", "Joel", "Amós", "Abdías", "Jonás", "Miqueas",
  "Nahúm", "Habacuc", "Sofonías", "Hageo", "Zacarías", "Malaquías", // AT (39)
  "Mateo", "Marcos", "Lucas", "Juan", "Hechos", "Romanos", "1 Corintios", "2 Corintios",
  "Gálatas", "Efesios", "Filipenses", "Colosenses", "1 Tesalonicenses", "2 Tesalonicenses",
  "1 Timoteo", "2 Timoteo", "Tito", "Filemón", "Hebreos", "Santiago", "1 Pedro", "2 Pedro",
  "1 Juan", "2 Juan", "3 Juan", "Judas", "Apocalipsis", // NT (27)
];

type XmlNode = Record<string, unknown>;

function toNode(value: unknown): XmlNode | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as XmlNode)
    : undefined;
}

/** A single element parses as an object and a repeated one as an array. */
function toArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function readNumber(node: XmlNode): number {
  const raw = node["@_number"];
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return Number.NaN;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function readText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const node = toNode(value);
  if (!node) return "";
  const text = node["#text"];
  if (typeof text === "string") return text.trim();
  if (Array.isArray(text)) {
    return text.filter((part): part is string => typeof part === "string").join("").trim();
  }
  return "";
}

/**
 * Reads a Bible XML file into the books, chapters and verses it declares.
 *
 * Verses without a number or without text are dropped: they carry nothing to
 * publish and would only produce empty rows downstream.
 */
export function parseBibleXml(xml: string): ParsedBible {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  const parsed: unknown = parser.parse(xml);
  const bible = toNode(toNode(parsed)?.["bible"]);
  if (!bible) return { books: [] };

  const books: ParsedBook[] = [];

  for (const rawTestament of toArray(bible["testament"])) {
    const testament = toNode(rawTestament);
    if (!testament) continue;
    const isOld = testament["@_name"] === "Old";

    for (const rawBook of toArray(testament["book"])) {
      const book = toNode(rawBook);
      if (!book) continue;
      const number = readNumber(book);
      const name = BIBLE_BOOK_NAMES[number] || `Libro ${number}`;
      const chapters: ParsedChapter[] = [];

      for (const rawChapter of toArray(book["chapter"])) {
        const chapter = toNode(rawChapter);
        if (!chapter) continue;
        const verses: ParsedVerse[] = [];

        for (const rawVerse of toArray(chapter["verse"])) {
          const verse = toNode(rawVerse);
          const verseNumber = verse ? readNumber(verse) : Number.NaN;
          const text = readText(rawVerse);
          if (Number.isNaN(verseNumber) || !text) continue;
          verses.push({ number: verseNumber, text });
        }

        chapters.push({ number: readNumber(chapter), verses });
      }

      books.push({ number, name, testament: isOld ? "AT" : "NT", chapters });
    }
  }

  return { books };
}
