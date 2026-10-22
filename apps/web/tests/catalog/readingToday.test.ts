import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_ROUTES, ROUTE_META, canonicalUrl } from "../../src/config/seo.config";
import {
  chapterLink,
  fetchBookSlugs,
  fetchTodayReading,
} from "../../src/lib/bible";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");

afterEach(() => {
  vi.unstubAllGlobals();
});

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

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

describe("the slugs of the published books", () => {
  it("links a chapter to the page the build published", () => {
    const link = chapterLink("Job", 1, { Job: "job" });

    expect(link.label).toBe("Job 1");
    expect(link.href).toBe("/biblia/job/1/");
  });

  it("renders a chapter without a link when its book has no published page", () => {
    // The rotation reads a translation the build did not publish, so the
    // chapter has no page. A link to a page that was never written would be
    // a broken one.
    const link = chapterLink("Salmos", 1, { Job: "job" });

    expect(link.label).toBe("Salmos 1");
    expect(link.href).toBeNull();
  });

  it("reads the map the build wrote", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Job: "job", "1 Reyes": "1-reyes" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const slugs = await fetchBookSlugs();

    expect(fetchMock).toHaveBeenCalledWith("/biblia/books.json");
    expect(slugs).toEqual({ Job: "job", "1 Reyes": "1-reyes" });
  });

  it("has no map when the build published no catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    expect(await fetchBookSlugs()).toEqual({});
  });

  it("has no map when the file cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    expect(await fetchBookSlugs()).toEqual({});
  });

  // The artifact owns the slugs: the build reads them and writes the map, and
  // the application links the chapters with them. A rule of its own in the
  // browser would be a second implementation, and the two would not have to
  // agree on the name that folds onto another one.
  it("are not derived in the browser", () => {
    const offenders = listSourceFiles(srcRoot)
      .filter((file) => /normalize\(\s*["']NFD["']\s*\)/.test(readFileSync(file, "utf8")))
      .map((file) => relative(srcRoot, file).split(sep).join("/"));

    expect(offenders, "the web app derives a slug of its own").toEqual([]);
  });
});

describe("fetchTodayReading", () => {
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

    // The URL depends on the configured origin, so only the path is pinned.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/bible\/reading\/today$/);
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

  // An answer the code cannot read is a failure, not a day without a
  // reading: the page has to say that it could not read it.
  it("throws when the answer is not the one it promises", async () => {
    const unreadable = [
      { json: async () => ({}) },
      { json: async () => ({ reading: "Job 1" }) },
      { json: async () => ({ reading: { rotationName: "Lectura", chapters: "Job 1" } }) },
      { json: async () => ({ reading: { rotationName: "Lectura", chapters: [{ book: 1 }] } }) },
    ];

    for (const answer of unreadable) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, ...answer }));
      await expect(fetchTodayReading()).rejects.toThrow();
    }
  });
});
