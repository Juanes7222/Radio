import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_ROUTES, ROUTE_META, canonicalUrl } from "../../src/config/seo.config";
import { bookSlug, chapterPath, fetchTodayReading } from "../../src/lib/bible";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

describe("the reading of the day", () => {
  it("is a public route with its own title and description", () => {
    expect(PUBLIC_ROUTES).toContain("/lectura-de-hoy");
    const meta = ROUTE_META["/lectura-de-hoy"];
    expect(meta.title).toContain("Lectura bíblica");
    expect(canonicalUrl("/lectura-de-hoy")).toBe("https://lavozverdad.com/lectura-de-hoy/");
  });

  it("is registered in the router of the public site", () => {
    const main = readFileSync(join(srcRoot, "main.tsx"), "utf8");
    expect(main).toContain('<Route path="/lectura-de-hoy" element={<ReadingTodayPage />} />');
  });

  // The page answers with three different things and the reader has to be
  // able to tell them apart: a card that is still loading, a day without a
  // reading scheduled and an answer that could not be read.
  it("models the loading, empty and error states", () => {
    const page = readFileSync(join(srcRoot, "pages", "ReadingTodayPage.tsx"), "utf8");
    expect(page).toContain("Cargando la lectura de hoy");
    expect(page).toContain("No hay lectura programada");
    expect(page).toContain("Reintentar");
  });
});

describe("the chapter pages of the catalog", () => {
  it("names a book the way the generated pages are named", () => {
    expect(bookSlug("Génesis")).toBe("genesis");
    expect(bookSlug("1 Reyes")).toBe("1-reyes");
    expect(bookSlug("Números")).toBe("numeros");
  });

  it("builds the path of the page of a chapter", () => {
    expect(chapterPath("Job", 1)).toBe("/biblia/job/1/");
  });
});

describe("fetchTodayReading", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the backend for the reading of the day", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reading: {
          rotationName: "Lectura bíblica",
          chapters: [{ ordinal: 1, book: "Génesis", chapter: 1 }],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await fetchTodayReading();

    expect(fetchMock).toHaveBeenCalledWith("/api/bible/reading/today");
    expect(payload.reading?.chapters).toHaveLength(1);
  });

  it("throws when the backend fails, so the page can offer a retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchTodayReading()).rejects.toThrow();
  });

  it("reports no reading when the answer carries none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reading: null }) }),
    );

    const payload = await fetchTodayReading();

    expect(payload.reading).toBeNull();
  });
});
