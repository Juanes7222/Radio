import { describe, expect, it } from "vitest";
import type { Catalog } from "@radio/types";
import { buildCatalogPages, renderCatalogDocument } from "../../src/content/catalogPages";

const CATALOG: Catalog = {
  generatedAt: "2026-10-21T00:00:00.000Z",
  translation: { abbreviation: "RVG2004", name: "Reina-Valera Gómez 2004" },
  books: [{ slug: "job", name: "Job", order: 18, testament: "AT", chapterCount: 1 }],
  chapters: [
    { bookSlug: "job", number: 1, verses: [{ number: 1, text: "Había en la tierra de Uz un varón llamado Job" }] },
  ],
  artists: [
    { slug: "abel-zavala", name: "Abel Zavala", songCount: 1, songs: [{ title: "A Ti Sea la Gloria", album: "Cd", genre: "Gospel" }] },
  ],
  videos: [],
};

// The names below are the worst case the artifact can carry. A title over 70
// characters and a description over 160 are truncated by Google, so the
// generator has to shorten them instead of emitting them raw.
const LONG_ARTIST_NAME = "Ministerio de Alabanza y Adoración Vida Eterna de Colombia y el Mundo";
const LONG_BOOK_NAME = "Los Cantares de la Sabiduría de Salomón y de la Reina de Saba";
const LONG_TRANSLATION_NAME =
  "Reina-Valera Gómez 2004 edición revisada por la Fundación Bíblica de las Américas";

const LONG_NAMES_CATALOG: Catalog = {
  ...CATALOG,
  translation: { abbreviation: "RVG2004", name: LONG_TRANSLATION_NAME },
  books: [{ slug: "cantares", name: LONG_BOOK_NAME, order: 18, testament: "AT", chapterCount: 1 }],
  chapters: [
    { bookSlug: "cantares", number: 1, verses: [{ number: 1, text: "Había en la tierra de Uz un varón llamado Job" }] },
  ],
  artists: [
    { slug: "ministerio", name: LONG_ARTIST_NAME, songCount: 1, songs: [{ title: "A Ti Sea la Gloria", album: "Cd", genre: "Gospel" }] },
  ],
};

const CATALOG_WITH_VIDEO: Catalog = {
  ...CATALOG,
  videos: [
    { videoId: "abc123XYZ_-", title: "Predicación de hoy", channelTitle: "La Voz de la Verdad", publishedAt: "2026-10-20T10:00:00.000Z" },
  ],
};

const CATALOG_WITH_MISSING_CHAPTERS: Catalog = {
  ...CATALOG,
  // The book declares three chapters, but the artifact carries one with verses
  // and one without: only the first one is a page.
  books: [{ slug: "job", name: "Job", order: 18, testament: "AT", chapterCount: 3 }],
  chapters: [
    { bookSlug: "job", number: 1, verses: [{ number: 1, text: "Había en la tierra de Uz un varón llamado Job" }] },
    { bookSlug: "job", number: 2, verses: [] },
  ],
};

const CATALOG_WITH_THREE_CHAPTERS: Catalog = {
  ...CATALOG,
  books: [{ slug: "job", name: "Job", order: 18, testament: "AT", chapterCount: 3 }],
  chapters: [
    { bookSlug: "job", number: 1, verses: [{ number: 1, text: "Había en la tierra de Uz" }] },
    { bookSlug: "job", number: 2, verses: [{ number: 1, text: "Respondió Job" }] },
    { bookSlug: "job", number: 3, verses: [{ number: 1, text: "Y dyingó el Señor" }] },
  ],
};

describe("buildCatalogPages", () => {
  it("builds one page per chapter with its text in the body", () => {
    const pages = buildCatalogPages(CATALOG);
    const chapter = pages.find((p) => p.path === "/biblia/job/1/");
    expect(chapter?.title).toContain("Job 1");
    expect(chapter?.body).toContain("Había en la tierra de Uz");
  });

  it("escapes the text it writes into the body", () => {
    const pages = buildCatalogPages({ ...CATALOG, chapters: [{ bookSlug: "job", number: 1, verses: [{ number: 1, text: "Grace & <Truth>" }] }] });
    expect(pages.find((p) => p.path === "/biblia/job/1/")?.body).toContain("Grace &amp; &lt;Truth&gt;");
  });

  it("keeps the title under 70 characters and the description over 50", () => {
    for (const page of buildCatalogPages(CATALOG)) {
      expect(page.title.length, page.path).toBeLessThanOrEqual(70);
      expect(page.description.length, page.path).toBeGreaterThan(50);
      expect(page.description.length, page.path).toBeLessThanOrEqual(160);
    }
  });

  it("shortens the title and the description of the longest names", () => {
    expect(LONG_ARTIST_NAME).toHaveLength(69);
    const pages = buildCatalogPages(LONG_NAMES_CATALOG);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(page.title.length, `${page.path} :: ${page.title}`).toBeLessThanOrEqual(70);
      expect(page.description.length, `${page.path} :: ${page.description}`).toBeGreaterThan(50);
      expect(page.description.length, `${page.path} :: ${page.description}`).toBeLessThanOrEqual(160);
    }
    // The name is shortened, the keyword half of the title is not.
    const artist = pages.find((p) => p.path === "/alabanza/ministerio/");
    expect(artist?.title.length).toBeLessThanOrEqual(70);
    expect(artist?.title).toContain("Canciones de alabanza");
  });

  it("publishes the video page only when the catalog has videos", () => {
    const withVideo = buildCatalogPages(CATALOG_WITH_VIDEO);
    const videos = withVideo.find((p) => p.path === "/videos/");
    expect(videos).toBeDefined();

    const withoutVideo = buildCatalogPages(CATALOG);
    expect(withoutVideo.find((p) => p.path === "/videos/")).toBeUndefined();
  });

  it("publishes only the chapters that have verses", () => {
    const pages = buildCatalogPages(CATALOG_WITH_MISSING_CHAPTERS);
    // The chapter without verses is not a page.
    expect(pages.find((p) => p.path === "/biblia/job/2/")).toBeUndefined();

    const book = pages.find((p) => p.path === "/biblia/job/");
    expect(book?.description).toContain("1 capítulo");
    expect(book?.description).not.toContain("3 capítulos");
    // And it is not linked either.
    expect(book?.body).not.toContain("/biblia/job/2/");

    const index = pages.find((p) => p.path === "/biblia/");
    expect(index?.title).toContain("1 libro y 1 capítulo");
  });

  it("links the previous and the next chapter instead of the whole list", () => {
    const pages = buildCatalogPages(CATALOG_WITH_THREE_CHAPTERS);
    const middle = pages.find((p) => p.path === "/biblia/job/2/");
    expect(middle?.body).toContain('rel="prev"');
    expect(middle?.body).toContain('rel="next"');
    expect(middle?.body).toContain("/biblia/job/1/");
    expect(middle?.body).toContain("/biblia/job/3/");
    // The whole list of the chapters is not repeated on every chapter page.
    expect(middle?.body).not.toContain("/biblia/job/2/");

    // The page of the book is the one that lists every chapter.
    const book = pages.find((p) => p.path === "/biblia/job/");
    expect(book?.body).toContain("/biblia/job/1/");
    expect(book?.body).toContain("/biblia/job/2/");
    expect(book?.body).toContain("/biblia/job/3/");
  });
});

describe("renderCatalogDocument", () => {
  it("writes the canonical, the json-ld and the player", () => {
    const document = renderCatalogDocument(buildCatalogPages(CATALOG).find((p) => p.path === "/biblia/job/1/")!);
    expect(document).toContain('<link rel="canonical" href="https://lavozverdad.com/biblia/job/1/" />');
    expect(document).toContain('type="application/ld+json"');
    expect(document).toContain("/listen/la_voz_de_la_verdad/");
  });

  it("keeps the json-ld parseable", () => {
    const page = buildCatalogPages(CATALOG).find((p) => p.path === "/biblia/job/1/")!;
    const parsed = JSON.parse(page.jsonLd) as { "@graph": { "@type": string; name?: string }[] };
    const webPage = parsed["@graph"].find((node) => node["@type"] === "WebPage");
    expect(webPage).toBeDefined();
    expect(webPage?.name).toBe(page.title);
  });

  it("does not let a verse close the script element", () => {
    const pages = buildCatalogPages({
      ...CATALOG,
      chapters: [{ bookSlug: "job", number: 1, verses: [{ number: 1, text: "</script><script>alert(1)</script>" }] }],
    });
    const document = renderCatalogDocument(pages.find((p) => p.path === "/biblia/job/1/")!);
    // The document has one script element, so it has exactly one closing tag.
    expect(document.match(/<\/script>/g)).toHaveLength(1);
    expect(document).toContain("&lt;/script&gt;");
  });

  it("does not let a title close the script element of the json-ld", () => {
    const pages = buildCatalogPages({
      ...CATALOG_WITH_VIDEO,
      videos: [
        { videoId: "abc123XYZ_-", title: "</script><script>alert(1)</script>", channelTitle: "La Voz de la Verdad", publishedAt: "2026-10-20T10:00:00.000Z" },
      ],
    });
    const document = renderCatalogDocument(pages.find((p) => p.path === "/videos/")!);
    expect(document.match(/<\/script>/g)).toHaveLength(1);
    // The title is in the json-ld, escaped as a unicode sequence.
    expect(document).toContain("\\u003c/script\\u003e");
  });

  it("does not embed the videos, it links to them", () => {
    const pages = buildCatalogPages(CATALOG_WITH_VIDEO);
    const document = renderCatalogDocument(pages.find((p) => p.path === "/videos/")!);
    expect(document).not.toContain("<iframe");
    expect(document).toContain("https://www.youtube.com/watch?v=abc123XYZ_-");
  });
});
