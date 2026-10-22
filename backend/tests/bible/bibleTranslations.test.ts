import { describe, expect, it } from "vitest";
import {
  BIBLE_BOOK_NAMES,
  PUBLISHED_TRANSLATION,
  parseBibleXml,
} from "../../src/modules/bible/bibleTranslations";

// The XML numbers the books in canonical order, so Job is book 18.
const FIXTURE = `<bible translation="test">
  <testament name="Old">
    <book number="18"><chapter number="2"><verse number="1">Había un hombre</verse><verse number="2">en la tierra</verse></chapter></book>
  </testament>
</bible>`;

describe("parseBibleXml", () => {
  it("maps the book number to the Spanish book name", () => {
    const parsed = parseBibleXml(FIXTURE);
    expect(parsed.books).toHaveLength(1);
    expect(parsed.books[0]?.name).toBe("Job");
    expect(parsed.books[0]?.testament).toBe("AT");
  });

  it("keeps the verse numbers and the text", () => {
    const parsed = parseBibleXml(FIXTURE);
    expect(parsed.books[0]?.chapters[0]?.verses).toEqual([
      { number: 1, text: "Había un hombre" },
      { number: 2, text: "en la tierra" },
    ]);
  });

  it("reads every testament and book of a file that declares several of them", () => {
    const parsed = parseBibleXml(`<bible translation="test">
      <testament name="Old">
        <book number="1"><chapter number="1"><verse number="1">En el principio</verse></chapter></book>
        <book number="2"><chapter number="1"><verse number="1">Y hubo tarde y mañana</verse></chapter></book>
      </testament>
      <testament name="New">
        <book number="43"><chapter number="1"><verse number="1">En el principio era el Verbo</verse></chapter></book>
      </testament>
    </bible>`);
    expect(parsed.books.map((book) => `${book.number}:${book.name}:${book.testament}`)).toEqual([
      "1:Génesis:AT",
      "2:Éxodo:AT",
      "43:Juan:NT",
    ]);
  });

  it("returns no books for a file without a bible root", () => {
    expect(parseBibleXml("<not-a-bible/>").books).toEqual([]);
  });

  it("falls back to a generic name for a book number that is not in the catalog", () => {
    const parsed = parseBibleXml(
      `<bible translation="test"><testament name="New"><book number="999"><chapter number="1"></chapter></book></testament></bible>`,
    );
    expect(parsed.books[0]?.name).toBe("Libro 999");
    expect(parsed.books[0]?.testament).toBe("NT");
  });

  it("points at a file that exists in the submodule", () => {
    expect(PUBLISHED_TRANSLATION.abbreviation).toBe("RVG2004");
    expect(PUBLISHED_TRANSLATION.file).toBe("SpanishRVGBible.xml");
  });

  it("names the 66 books with Genesis at index 1", () => {
    expect(BIBLE_BOOK_NAMES[1]).toBe("Génesis");
    expect(BIBLE_BOOK_NAMES[18]).toBe("Job");
    expect(BIBLE_BOOK_NAMES[66]).toBe("Apocalipsis");
    expect(BIBLE_BOOK_NAMES).toHaveLength(67);
  });
});
