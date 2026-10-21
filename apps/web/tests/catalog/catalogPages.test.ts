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
});

describe("renderCatalogDocument", () => {
  it("writes the canonical, the json-ld and the player", () => {
    const document = renderCatalogDocument(buildCatalogPages(CATALOG).find((p) => p.path === "/biblia/job/1/")!);
    expect(document).toContain('<link rel="canonical" href="https://lavozverdad.com/biblia/job/1/" />');
    expect(document).toContain('type="application/ld+json"');
    expect(document).toContain("/listen/la_voz_de_la_verdad/");
  });
});
