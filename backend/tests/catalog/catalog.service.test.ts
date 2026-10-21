import { describe, expect, it } from "vitest";
import {
  buildCatalogBooks,
  chapterSlugParts,
  groupSongsByArtist,
  uniqueSlugs,
} from "../../src/modules/catalog/catalog.service";

describe("groupSongsByArtist", () => {
  it("groups the songs of an artist and sorts them by title", () => {
    const grouped = groupSongsByArtist([
      { title: "Zona", artist: "Abel Zavala", album: "Cd", genre: "Gospel" },
      { title: "Alabanza", artist: "Abel Zavala", album: "Cd", genre: "Gospel" },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.name).toBe("Abel Zavala");
    expect(grouped[0]?.songs.map((s) => s.title)).toEqual(["Alabanza", "Zona"]);
  });

  it("drops the songs without an artist instead of grouping them under a placeholder", () => {
    const grouped = groupSongsByArtist([
      { title: "Sin artista", artist: null, album: null, genre: null },
    ]);
    expect(grouped).toEqual([]);
  });

  it("turns a missing album and a missing genre into empty strings", () => {
    const grouped = groupSongsByArtist([
      { title: "Alabanza", artist: "Abel Zavala", album: null, genre: null },
    ]);
    expect(grouped[0]?.songs[0]).toEqual({ title: "Alabanza", album: "", genre: "" });
  });
});

describe("chapterSlugParts", () => {
  it("slugifies the book name and appends the chapter", () => {
    expect(chapterSlugParts("1 Corintios", 13)).toEqual({ bookSlug: "1-corintios", path: "1-corintios/13" });
  });
});

describe("uniqueSlugs", () => {
  it("disambiguates two names that fold to the same slug", () => {
    const slugs = uniqueSlugs(["José Soto", "Jose Soto"]);
    expect(slugs.get("José Soto")).toBe("jose-soto");
    expect(slugs.get("Jose Soto")).toBe("jose-soto-2");
  });

  it("keeps the same slug for the same name twice", () => {
    const slugs = uniqueSlugs(["Job", "Job"]);
    expect(slugs.get("Job")).toBe("job");
  });
});

describe("buildCatalogBooks", () => {
  it("drops the books without a published chapter", () => {
    const books = buildCatalogBooks([
      { slug: "job", name: "Job", order: 18, testament: "AT", chapterCount: 2 },
      { slug: "sin-texto", name: "Sin texto", order: 67, testament: "NT", chapterCount: 0 },
    ]);
    expect(books.map((book) => book.slug)).toEqual(["job"]);
    expect(books[0]?.chapterCount).toBe(2);
  });
});
