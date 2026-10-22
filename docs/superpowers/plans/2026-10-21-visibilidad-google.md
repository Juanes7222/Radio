# Visibilidad en Google Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the station's own content — the Bible text, the worship catalog and the videos — as static, indexable pages that end at the live stream.

**Architecture:** Two halves. A backend export script writes one JSON artifact with the catalog; the web build reads that artifact and writes static HTML pages into `dist/`, adding their URLs to the sitemap. The React app is untouched apart from one new route and the service worker.

**Tech Stack:** TypeScript, Vite 7, React 19, Tailwind CSS (the app only), Express + Prisma 6, vitest, AzuraCast API, Prisma SQLite.

**Spec:** `docs/superpowers/specs/2026-10-21-visibilidad-google-design.md`

## Global Constraints

- The repository is TypeScript-first. No new JavaScript files.
- Code comments, docstrings and JSDoc are written in English. User-facing copy (page titles, descriptions, page body) is in Spanish.
- No `any`. Explicit types on every exported function.
- No new runtime dependency. Everything here uses what is already installed.
- Canonical URLs always carry a trailing slash, because that is the form nginx answers with 200 (`try_files $uri $uri/`). The existing `canonicalUrl()` in `apps/web/src/config/seo.config.ts` is the only place that decides it.
- The site is `https://lavozverdad.com`. `SITE_URL` in `seo.config.ts` is the only source for that value.
- The published Bible text is the free-to-redistribute translation (Reina-Valera Gómez 2004), never RVR1960.
- The service worker must not serve a cached page in place of a catalog page, and must not overwrite the cached home page with a catalog page.
- The Content-Security-Policy of the public host does not allow `frame-src` for youtube.com, so the video pages link to YouTube and do not embed an iframe.
- The backend test suite never boots Prisma and never calls AzuraCast. Everything tested in the backend is a pure function.
- The web test suite is Node-only, `include: ["tests/**/*.test.ts"]`.

## Review Focus

Five input classes the spec implies but no task's test would otherwise exercise. Each one gets a test in the task that owns the code.

1. **Two different names that fold to the same slug** ("José Soto" and "Jose Soto"; an artist called "Job" next to the book of Job). A collision would silently overwrite a page. The slug builder must detect a collision and disambiguate it, and the test must pin that.
2. **Titles and verse text containing HTML characters.** A song titled "Grace & Truth" or a verse with `<` would break the page if it is not escaped. Every text that reaches the HTML goes through the escaper.
3. **A chapter with no verses in the database.** A partially seeded translation would publish an empty page. Such a chapter is skipped, not published.
4. **A song with no artist.** AzuraCast returns `artist: null` for some files. Those songs must not create an artist page called "null" or "Unknown".
5. **A title longer than 70 characters or a description longer than 160.** Google truncates them. The generator must shorten them, not emit them raw.

---

## File Structure

**Backend (the export half)**

- `backend/src/modules/bible/bibleTranslations.ts` — the registry of publishable translations and the XML parser. Pure.
- `backend/src/modules/catalog/catalog.service.ts` — builds the catalog artifact. Pure functions separated from the IO.
- `backend/src/scripts/export-catalog.ts` — the CLI that writes the artifact.
- `backend/scripts/seed-bible.ts` — modified to seed a translation given by arguments.
- `backend/tests/bible/bibleTranslations.test.ts` — new.
- `backend/tests/catalog/catalog.service.test.ts` — new.

**Shared**

- `packages/types/src/catalog.ts` — the artifact type, shared by both halves. New.
- `packages/types/src/index.ts` — re-export it.

**Web (the generation half)**

- `apps/web/src/content/slug.ts` — the slug builder with collision detection. New.
- `apps/web/src/content/catalogPages.ts` — the catalog to page list, and the HTML of each page. New.
- `apps/web/src/config/seo.config.ts` — modified: head/social builders that accept any page, and a sitemap that accepts extra entries.
- `apps/web/vite/seoPlugin.ts` — the Vite plugins, moved out of `vite.config.ts` and extended with the catalog writer. New.
- `apps/web/vite.config.ts` — modified: use the plugins from the new file.
- `apps/web/public/catalog.css` — the stylesheet of the generated pages. New.
- `apps/web/src/pages/ReadingTodayPage.tsx` — the React route for the reading of the day. New.
- `apps/web/src/main.tsx` — modified: register the route.
- `apps/web/public/sw.js` — modified: stop poisoning the cached home page.
- `apps/web/tests/catalog/*.test.ts` — new.

**Infra and docs**

- `scripts/nginx/snippets/web-locations.conf` — modified: 404 for unknown paths.
- `scripts/deploy.sh` — modified: run the export between the backend build and the web build.
- `apps/web/.gitignore` — new: the generated artifact is not committed.
- `docs/runbooks/visibilidad-google.md` — the manual Search Console work. New.

---

### Task 1: The free Bible translation, parsed

The published pages need the text of every chapter in a translation that can be redistributed. The submodule already ships about thirty Spanish translations; `SpanishRVGBible.xml` (Reina-Valera Gómez 2004) declares "Copyright Allowed To Use" in its own header.

**Files:**
- Create: `backend/src/modules/bible/bibleTranslations.ts`
- Modify: `backend/scripts/seed-bible.ts`
- Test: `backend/tests/bible/bibleTranslations.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BibleTranslationSource {
    readonly abbreviation: string;   // "RVG2004"
    readonly name: string;           // "Reina-Valera Gómez 2004"
    readonly file: string;           // "SpanishRVGBible.xml"
  }
  export const PUBLISHED_TRANSLATION: BibleTranslationSource;
  export interface ParsedVerse { readonly number: number; readonly text: string }
  export interface ParsedChapter { readonly number: number; readonly verses: ParsedVerse[] }
  export interface ParsedBook { readonly number: number; readonly name: string; readonly testament: "AT" | "NT"; readonly chapters: ParsedChapter[] }
  export interface ParsedBible { readonly books: ParsedBook[] }
  export function parseBibleXml(xml: string): ParsedBible;
  export const BIBLE_BOOK_NAMES: readonly string[]; // index 0 is Genesis
  ```

- [ ] **Step 1: Write the failing test**

`backend/tests/bible/bibleTranslations.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BIBLE_BOOK_NAMES, PUBLISHED_TRANSLATION, parseBibleXml } from "../../src/modules/bible/bibleTranslations";

const FIXTURE = `<bible translation="test">
  <testament name="Old">
    <book number="19"><chapter number="2"><verse number="1">Había un hombre</verse><verse number="2">en la tierra</verse></chapter></book>
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

  it("points at a file that exists in the submodule", () => {
    expect(PUBLISHED_TRANSLATION.abbreviation).toBe("RVG2004");
    expect(PUBLISHED_TRANSLATION.file).toBe("SpanishRVGBible.xml");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @radio/backend test`
Expected: FAIL, "Cannot find module '../../src/modules/bible/bibleTranslations'".

- [ ] **Step 3: Implement `backend/src/modules/bible/bibleTranslations.ts`**

Move the `bookNames` array and the XML parsing out of `seed-bible.ts` into this module. `parseBibleXml` uses `fast-xml-parser`'s `XMLParser` with the same options the seed script uses today (`ignoreAttributes: false`, `attributeNamePrefix: "@_"`), reads `bible.testament` (which may be an array or a single object), reads `book['@_number']`, `chapter['@_number']` and `verse['@_number']`, and resolves the book name from `BIBLE_BOOK_NAMES[bookNumber]`.

`BIBLE_BOOK_NAMES` is the exact 66-name array currently in `seed-bible.ts`, with index 0 unused so that index 1 is Genesis.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @radio/backend test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Make the seed script take the translation as an argument**

`backend/scripts/seed-bible.ts` keeps seeding the database but now reads the XML file named by `PUBLISHED_TRANSLATION.file` unless the first CLI argument names another file, and it upserts the translation with `PUBLISHED_TRANSLATION.abbreviation` and `PUBLISHED_TRANSLATION.name`. The default keeps the current behaviour of seeding RVR1960 only when it is asked for explicitly.

Add to `backend/package.json`:

```json
"seed:bible:published": "ts-node scripts/seed-bible.ts --published"
```

`--published` selects `PUBLISHED_TRANSLATION`; without it the script keeps seeding `SpanishRVR1960Bible.xml` as `RVR1960`.

- [ ] **Step 6: Run the seed against the fixture-free path and check it does not crash**

Run: `pnpm --filter @radio/backend exec ts-node scripts/seed-bible.ts --help`
Expected: the script prints its usage and exits 0 without touching the database.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/bible/bibleTranslations.ts backend/scripts/seed-bible.ts backend/tests/bible/bibleTranslations.test.ts backend/package.json
git commit -m "feat(bible): parse a free-to-redistribute Spanish translation"
```

---

### Task 2: The shared catalog type

**Files:**
- Create: `packages/types/src/catalog.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CatalogVerse { readonly number: number; readonly text: string }
  export interface CatalogChapter {
    readonly bookSlug: string;
    readonly number: number;
    readonly verses: readonly CatalogVerse[];
  }
  export interface CatalogBook {
    readonly slug: string;
    readonly name: string;
    readonly order: number;
    readonly testament: "AT" | "NT";
    readonly chapterCount: number;
  }
  export interface CatalogSong {
    readonly title: string;
    readonly album: string;
    readonly genre: string;
  }
  export interface CatalogArtist {
    readonly slug: string;
    readonly name: string;
    readonly songCount: number;
    readonly songs: readonly CatalogSong[];
  }
  export interface CatalogVideo {
    readonly videoId: string;
    readonly title: string;
    readonly channelTitle: string;
    readonly publishedAt: string; // ISO date
  }
  export interface Catalog {
    readonly generatedAt: string; // ISO date
    readonly translation: { readonly abbreviation: string; readonly name: string };
    readonly books: readonly CatalogBook[];
    readonly chapters: readonly CatalogChapter[];
    readonly artists: readonly CatalogArtist[];
    readonly videos: readonly CatalogVideo[];
  }
  ```

- [ ] **Step 1: Create `packages/types/src/catalog.ts` with the interfaces above**

- [ ] **Step 2: Re-export it from `packages/types/src/index.ts`**

Add `export * from './catalog';` in alphabetical position (after `bible`).

- [ ] **Step 3: Build the shared package**

Run: `pnpm --filter @radio/types build`
Expected: PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/catalog.ts packages/types/src/index.ts
git commit -m "feat(types): add the catalog artifact type"
```

---

### Task 3: The export

**Files:**
- Create: `backend/src/modules/catalog/catalog.service.ts`
- Create: `backend/src/scripts/export-catalog.ts`
- Modify: `backend/package.json`
- Test: `backend/tests/catalog/catalog.service.test.ts`

**Interfaces:**
- Consumes: `Catalog` and its members from `@radio/types`; `parseBibleXml` and `PUBLISHED_TRANSLATION` from `../bible/bibleTranslations`; `slugify` from `../../shared/utils/text`.
- Produces:
  ```ts
  // backend/src/modules/catalog/catalog.service.ts
  export interface LibrarySong {
    readonly title: string;
    readonly artist: string | null;
    readonly album: string | null;
    readonly genre: string | null;
  }
  export function groupSongsByArtist(songs: readonly LibrarySong[]): { name: string; songs: CatalogSong[] }[];
  export function buildCatalogBooks(books: readonly { slug: string; name: string; order: number; testament: "AT" | "NT"; chapterCount: number }[]): CatalogBook[];
  export function chapterSlugParts(bookName: string, chapterNumber: number): { bookSlug: string; path: string };
  export async function exportCatalog(targetPath: string): Promise<{ books: number; chapters: number; artists: number; videos: number }>;
  ```

- [ ] **Step 1: Write the failing test**

`backend/tests/catalog/catalog.service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupSongsByArtist, chapterSlugParts } from "../../src/modules/catalog/catalog.service";

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
});

describe("chapterSlugParts", () => {
  it("slugifies the book name and appends the chapter", () => {
    expect(chapterSlugParts("1 Corintios", 13)).toEqual({ bookSlug: "1-corintios", path: "1-corintios/13" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @radio/backend test`
Expected: FAIL, "Cannot find module '../../src/modules/catalog/catalog.service'".

- [ ] **Step 3: Implement the pure functions in `backend/src/modules/catalog/catalog.service.ts`**

`groupSongsByArtist` returns the artists sorted by name, each with its songs sorted by title, skipping every song whose artist is null or blank. A song with a null album becomes an empty string, and a null genre becomes an empty string.

`chapterSlugParts` uses `slugify` from `../../shared/utils/text` for the book name and returns the chapter path segment.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @radio/backend test`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement the IO half of `exportCatalog`**

`exportCatalog(targetPath)`:
- Reads the Bible from Prisma: the translation whose abbreviation is `PUBLISHED_TRANSLATION.abbreviation`, its books ordered by `order`, and for each book its chapters with their verses. A chapter with no verses is skipped (Review Focus 3).
- Reads the songs from AzuraCast with `azuracastApi.get('/station/{id}/requests')`, paginated, mapping each row to `LibrarySong` with `title`, `artist`, `album` and `genre`.
- Reads the videos from Prisma: `YouTubeVideo` rows joined with their `YouTubeChannel`, taking `videoId`, `title`, the channel title and `publishedAt ?? createdAt`.
- Writes the JSON to `targetPath` with `JSON.stringify(catalog, null, 2)`, creating the parent directory if needed.
- Returns the counts it wrote.

- [ ] **Step 6: Implement the CLI `backend/src/scripts/export-catalog.ts`**

It must load the secrets before anything imports the config, because `backend/src/config` throws at import time when a variable is missing. The pattern is the one in `backend/src/index.ts`:

```ts
import "dotenv/config";
import { initializeInfisicalSecrets } from "@radio/infisical-config";

async function main(): Promise<void> {
  await initializeInfisicalSecrets();
  const { exportCatalog } = await import("../modules/catalog/catalog.service");
  const target = process.argv[2] ?? "../../apps/web/catalog/catalog.json";
  const counts = await exportCatalog(target);
  console.log(`[catalog] books=${counts.books} chapters=${counts.chapters} artists=${counts.artists} videos=${counts.videos}`);
}
```

- [ ] **Step 7: Add the script to `backend/package.json`**

```json
"catalog:export": "ts-node src/scripts/export-catalog.ts"
```

- [ ] **Step 8: Wire the export into `scripts/deploy.sh`**

Between the backend build (line 358) and the web build (line 379), add:

```bash
"$PNPM_BIN" --filter "$BACKEND_PACKAGE" run catalog:export
```

The export must run before the web build because the web build reads the artifact it writes.

- [ ] **Step 9: Ignore the artifact**

Create `apps/web/.gitignore`:

```
catalog/
.cache/
```

- [ ] **Step 10: Run the export locally and check the artifact**

Run: `pnpm --filter @radio/backend run catalog:export`
Expected: it prints the counts and writes `apps/web/catalog/catalog.json`. If the environment has no AzuraCast credentials the command fails with a clear error; that is acceptable locally, the deploy has them.

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/catalog/catalog.service.ts backend/src/scripts/export-catalog.ts backend/tests/catalog/catalog.service.test.ts backend/package.json scripts/deploy.sh apps/web/.gitignore
git commit -m "feat(catalog): export the station catalog for the web build"
```

---

### Task 4: SEO primitives for pages that are not in the route table

The generated pages are not `PublicRoute`s, so the head builders need to accept any page, and the sitemap needs to accept extra entries.

**Files:**
- Modify: `apps/web/src/config/seo.config.ts`
- Test: `apps/web/tests/catalog/seoMeta.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PageMeta {
    readonly title: string;
    readonly description: string;
    readonly ogTitle: string;
    readonly canonical: string;
    readonly jsonLd: string; // already serialized
  }
  export function buildHeadTagsFor(page: PageMeta): string;
  export function buildSocialTagsFor(page: PageMeta): string;
  export interface SitemapEntry {
    readonly loc: string;
    readonly priority: number;
    readonly changefreq: "daily" | "weekly" | "monthly" | "yearly";
    readonly lastmod?: string; // "YYYY-MM-DD"
  }
  export function buildSitemapXml(lastModified: Date, extra?: readonly SitemapEntry[]): string;
  ```
  `buildHeadTags(route: PublicRoute)` and `buildSocialTags(route: PublicRoute)` keep their current signature and become thin wrappers over the new functions, so the eight existing routes are unchanged.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/catalog/seoMeta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildHeadTagsFor, buildSitemapXml, type SitemapEntry } from "../../src/config/seo.config";

const PAGE = {
  title: "Job 1 en español | Reina-Valera Gómez 2004",
  description: "Texto completo de Job 1 en la traducción Reina-Valera Gómez 2004, con la Biblia de la Voz de la Verdad.",
  ogTitle: "Job 1 en español",
  canonical: "https://lavozverdad.com/biblia/job/1/",
  jsonLd: '{"@type":"WebPage"}',
};

describe("buildHeadTagsFor", () => {
  it("emits the title, the description and the canonical of the page", () => {
    const html = buildHeadTagsFor(PAGE);
    expect(html).toContain(`<title>${PAGE.title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${PAGE.canonical}" />`);
  });

  it("escapes the values it writes into the attributes", () => {
    const html = buildHeadTagsFor({ ...PAGE, title: 'Grace & "Truth"' });
    expect(html).toContain("Grace &amp; &quot;Truth&quot;");
  });
});

describe("buildSitemapXml", () => {
  it("appends the extra entries to the public routes", () => {
    const extra: SitemapEntry[] = [
      { loc: "https://lavozverdad.com/biblia/job/1/", priority: 0.7, changefreq: "yearly", lastmod: "2026-10-21" },
    ];
    const sitemap = buildSitemapXml(new Date("2026-10-21T00:00:00Z"), extra);
    expect(sitemap).toContain("<loc>https://lavozverdad.com/</loc>");
    expect(sitemap).toContain("<loc>https://lavozverdad.com/biblia/job/1/</loc>");
    expect(sitemap).toContain("<lastmod>2026-10-21</lastmod>");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @radio/web test`
Expected: FAIL, "buildHeadTagsFor is not a function".

- [ ] **Step 3: Implement the new functions in `apps/web/src/config/seo.config.ts`**

`buildHeadTagsFor` writes the same five tags the current `buildHeadTags` writes, with the canonical coming from `page.canonical` instead of `canonicalUrl(route)`. `buildSocialTagsFor` writes the same Open Graph and Twitter tags, with `og:url` set to `page.canonical`.

`buildSitemapXml` keeps the current behaviour when `extra` is empty and appends one `<url>` block per extra entry, using the entry's own `lastmod` when it has one and the file's `lastmod` otherwise.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @radio/web test`
Expected: PASS, and the 45 tests that already existed still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/config/seo.config.ts apps/web/tests/catalog/seoMeta.test.ts
git commit -m "feat(seo): head and sitemap builders for generated pages"
```

---

### Task 5: The page generator

**Files:**
- Create: `apps/web/src/content/slug.ts`
- Create: `apps/web/src/content/catalogPages.ts`
- Create: `apps/web/public/catalog.css`
- Test: `apps/web/tests/catalog/catalogPages.test.ts`

**Interfaces:**
- Consumes: `Catalog` from `@radio/types`; `PageMeta` from `../config/seo.config`; `SITE_URL` from `../config/seo.config`.
- Produces:
  ```ts
  // apps/web/src/content/slug.ts
  export function slugifyName(value: string): string;
  export function uniqueSlugs(names: readonly string[]): Map<string, string>; // name -> slug, collisions disambiguated

  // apps/web/src/content/catalogPages.ts
  export interface CatalogPage {
    readonly path: string;          // "/biblia/job/1/" with leading and trailing slash
    readonly title: string;
    readonly description: string;
    readonly ogTitle: string;
    readonly jsonLd: string;
    readonly body: string;          // the inner HTML of <main>
    readonly lastmod: string;       // "YYYY-MM-DD"
    readonly priority: number;
    readonly changefreq: "daily" | "weekly" | "monthly" | "yearly";
  }
  export function buildCatalogPages(catalog: Catalog): CatalogPage[];
  export function renderCatalogDocument(page: CatalogPage): string; // the whole <!doctype html>
  ```

- [ ] **Step 1: Write the failing test**

`apps/web/tests/catalog/catalogPages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Catalog } from "@radio/types";
import { buildCatalogPages, renderCatalogDocument } from "../../src/content/catalogPages";
import { slugifyName, uniqueSlugs } from "../../src/content/slug";

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

describe("uniqueSlugs", () => {
  it("disambiguates two names that fold to the same slug", () => {
    const slugs = uniqueSlugs(["José Soto", "Jose Soto"]);
    expect(new Set(slugs.values()).size).toBe(2);
  });

  it("produces the same slug the backend wrote in the catalog", () => {
    // The backend has its own slugify, in shared/utils/text. The two have to
    // agree, or the links between the pages break. This assertion and the
    // one in backend/tests/catalog/catalog.service.test.ts are the same
    // fixture on purpose.
    expect(slugifyName("1 Corintios")).toBe("1-corintios");
    expect(slugifyName("Job")).toBe("job");
  });
});

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @radio/web test`
Expected: FAIL, "Cannot find module '../../src/content/catalogPages'".

- [ ] **Step 3: Implement `apps/web/src/content/slug.ts`**

`slugifyName` lowercases, strips diacritics, replaces every run of non-alphanumeric characters with a single dash and trims the dashes. `uniqueSlugs` maps each name to its slug and, when two names produce the same slug, appends `-2`, `-3`, and so on to the later ones, in the order they were given. The map is keyed by the original name.

- [ ] **Step 4: Implement `apps/web/src/content/catalogPages.ts`**

`buildCatalogPages` returns, in this order:

- One page per chapter: path `/biblia/<bookSlug>/<number>/`, title `"<Book> <n> en español | <Translation name>"`, description `"Texto completo de <Book> <n> en la traducción <Translation name>. Lee la Palabra de Dios y escúchala en La Voz de la Verdad."` shortened to 160 characters, JSON-LD of type `WebPage` with `about` the book, `isPartOf` the book page and `isPartOf` the site, and a body with the chapter heading, the verses with their numbers, a link to the book page, the sibling chapters, and the player.
- One page per book: path `/biblia/<bookSlug>/`, title `"<Book> en español | Biblia completa"`, description listing the chapter count, JSON-LD `WebPage` with `mainEntity` the book, and a body with the chapter list.
- One index page: path `/biblia/`, title `` `La Biblia en español | ${books.length} libros y ${chapters.length} capítulos` ``, JSON-LD `CollectionPage` with `hasPart` the books, and a body with the book list grouped by testament.
- One page per artist: path `/alabanza/<artistSlug>/`, title `"<Artist> | Canciones de alabanza"`, JSON-LD `WebPage` with `about` a `MusicGroup`, and a body with the songs and their albums.
- One index page: path `/alabanza/`, title `"Alabanza y adoración | Canciones cristianas"`, JSON-LD `CollectionPage`, and a body with the artists and their song counts.
- One page for the videos: path `/videos/`, only when `catalog.videos` is not empty, title `"Videos y predicaciones | La Voz de la Verdad"`, JSON-LD `ItemList` of `VideoObject`, and a body that links to each video on YouTube (no iframe, Review Focus).

The player is a `<audio controls preload="none" src="https://lavozverdad.com/listen/la_voz_de_la_verdad/">` inside a `<section>` with a heading "Escucha la radio en vivo", followed by a link to `https://lavozverdad.com/` with the text "Abrir la consola de La Voz de la Verdad".

Every text that reaches the HTML goes through the same escaping the rest of the app uses.

`renderCatalogDocument` writes the whole document: doctype, `<html lang="es">`, the head built with `buildHeadTagsFor` and `buildSocialTagsFor`, the JSON-LD script, a link to `/catalog.css`, and the body with the page's `<h1>` and body HTML.

- [ ] **Step 5: Write `apps/web/public/catalog.css`**

A small stylesheet: the dark palette the site already uses, a readable measure for the verses, and a visible focus state on the links. It must stay under 20 KB so it passes the `MAX_PUBLIC_FILE_BYTES` ceiling in `apps/web/tests/perf/static-assets.test.ts`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @radio/web test`
Expected: PASS, the new tests and the 45 existing ones.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/content/slug.ts apps/web/src/content/catalogPages.ts apps/web/public/catalog.css apps/web/tests/catalog/catalogPages.test.ts
git commit -m "feat(content): generate the catalog pages"
```

---

### Task 6: The build writes the pages

**Files:**
- Create: `apps/web/vite/seoPlugin.ts`
- Modify: `apps/web/vite.config.ts`
- Test: `apps/web/tests/catalog/buildOutput.test.ts`

**Interfaces:**
- Consumes: `buildCatalogPages` and `renderCatalogDocument` from `../src/content/catalogPages`; `Catalog` from `@radio/types`; `buildSitemapXml` from `../src/config/seo.config`.
- Produces: two Vite plugins, `perRouteSeoPlugin()` and `catalogPagesPlugin()`, both used by `vite.config.ts`.

- [ ] **Step 1: Move the SEO plugin code out of `vite.config.ts`**

`apps/web/vite/seoPlugin.ts` receives `SEO_BLOCKS`, `replaceSeoBlock`, `renderRouteHtml` and the `perRouteSeo` plugin as they are today, and exports them as `perRouteSeoPlugin()`. `apps/web/vite.config.ts` imports it and drops the moved code. The behaviour of the eight public routes must not change.

- [ ] **Step 2: Write the failing test**

`apps/web/tests/catalog/buildOutput.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const distDir = join(__dirname, "..", "..", "dist");

describe("catalog build output", () => {
  it("writes a page per chapter with its canonical", () => {
    const path = join(distDir, "biblia", "job", "1", "index.html");
    if (!existsSync(path)) return; // the catalog is not exported in this environment
    const html = readFileSync(path, "utf8");
    expect(html).toContain('<link rel="canonical" href="https://lavozverdad.com/biblia/job/1/" />');
    expect(html).toContain("Escucha la radio en vivo");
  });

  it("lists the catalog pages in the sitemap", () => {
    const path = join(distDir, "sitemap.xml");
    if (!existsSync(path)) return;
    const sitemap = readFileSync(path, "utf8");
    expect(sitemap).toContain("<loc>https://lavozverdad.com/biblia/</loc>");
  });
});
```

The test skips when the artifact is absent, because the artifact is a generated file and the repository does not commit it. The behaviour that matters is pinned by the generator test in Task 5; this one only checks the wiring.

- [ ] **Step 3: Implement `catalogPagesPlugin()`**

In `apps/web/vite/seoPlugin.ts`:

```ts
export function catalogPagesPlugin(): Plugin
```

- It reads `process.env.CATALOG_PATH ?? "catalog/catalog.json"` relative to the web app root. If the file does not exist, the plugin logs a warning and does nothing: a build without the catalog still produces the eight public routes.
- It parses the JSON as a `Catalog`, calls `buildCatalogPages`, and writes `dist/<path>/index.html` for each page, creating the directories.
- It returns the sitemap entries, one per page, with the page's `lastmod`, `priority` and `changefreq`.

The `perRouteSeoPlugin` writes the sitemap, so it needs the entries. The two plugins must coordinate: `catalogPagesPlugin` runs first and stores the entries in a module-level variable that `perRouteSeoPlugin` reads, or the sitemap writing moves into `catalogPagesPlugin`. The simpler of the two is to move the sitemap write into `catalogPagesPlugin` and have it write both the pages and the sitemap, calling `buildSitemapXml(new Date(), entries)`.

- [ ] **Step 4: Register the plugin in `apps/web/vite.config.ts`**

```ts
plugins: [react(), ...(command === "serve" ? [inspectAttr()] : []), perRouteSeoPlugin(), catalogPagesPlugin()],
```

- [ ] **Step 5: Build and check the output**

Run: `pnpm --filter @radio/web build`
Expected: the build succeeds. With the artifact present, `dist/biblia/job/1/index.html` and `dist/sitemap.xml` exist and the sitemap carries the catalog URLs. With it absent, the build still succeeds and logs the warning.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @radio/web test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/vite/seoPlugin.ts apps/web/vite.config.ts apps/web/tests/catalog/buildOutput.test.ts
git commit -m "feat(seo): write the catalog pages and their sitemap entries at build time"
```

---

### Task 7: The service worker must not swallow the catalog pages

`apps/web/public/sw.js` is network-first for navigations, but it also writes every visited navigation into the cache under `/index.html`. A visit to a catalog page would replace the cached home page, and the offline fallback would serve the wrong document.

**Files:**
- Modify: `apps/web/public/sw.js`
- Test: `apps/web/tests/catalog/serviceWorker.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing; the service worker keeps its existing public shape.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/catalog/serviceWorker.test.ts` is a source-level test, like `apps/web/tests/bumpers/upload-inputs.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sw = readFileSync(join(__dirname, "..", "..", "public", "sw.js"), "utf8");

describe("service worker navigation cache", () => {
  it("only stores the home page under /index.html", () => {
    const lines = sw.split("\n");
    const indexWrite = lines.findIndex((line) => line.includes("cache.put('/index.html'"));
    expect(indexWrite).toBeGreaterThan(-1);
    const guard = lines.slice(Math.max(0, indexWrite - 8), indexWrite).join("\n");
    expect(guard).toMatch(/url\s*===\s*['"]\/['"]|pathname\s*===\s*['"]\/['"]/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @radio/web test`
Expected: FAIL, the guard is missing.

- [ ] **Step 3: Fix `apps/web/public/sw.js`**

Only write `/index.html` into the cache when the request is the root:

```js
const isRoot = new URL(request.url).pathname === '/';
if (networkResponse.ok && request.method === 'GET') {
  caches.open(CACHE_NAME).then((cache) => {
    cache.put(request, networkResponse.clone());
    if (isRoot) cache.put('/index.html', networkResponse.clone());
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @radio/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public/sw.js apps/web/tests/catalog/serviceWorker.test.ts
git commit -m "fix(sw): stop the navigation cache from replacing the home page"
```

---

### Task 8: 404 for unknown URLs

Today every unknown path returns 200 with the home page. Google documents this as a soft 404. The fix needs the real status code and the admin panel has to stay reachable, because the admin app also lives on this host.

**Files:**
- Modify: `scripts/nginx/radio-global.conf` (the `map`, which only the http context accepts)
- Modify: `scripts/nginx/snippets/web-locations.conf`
- Test: none, the repository has no nginx test harness. The verification is the curl in Step 3.

**Interfaces:**
- Consumes: nothing.
- Produces: the variable `$spa_route`, 1 for the routes that exist as a client-side route and 0 for everything else.

- [ ] **Step 1: Declare the routes that exist**

`scripts/nginx/radio-global.conf` is copied to `/etc/nginx/conf.d/radio-global.conf`, which nginx reads in the http context, so the map goes there next to the other two:

```nginx
# The client-side routes of the public site. A request that matches none of
# them is a 404: serving the home page with a 200 for every typo is a soft
# 404, and it spends crawl budget on URLs nobody asked for.
map $uri $spa_route {
    default                0;
    "~^/$"                 1;
    "~^/admin(/|$)"        1;
    "~^/programacion/?$"   1;
    "~^/opiniones/?$"      1;
    "~^/info/"             1;
    "~^/lectura-de-hoy/?$" 1;
}
```

`"/admin-api/..."` does not match `~^/admin(/|$)`, because the character after "admin" is a dash and not a slash or the end of the string, so the API keeps its own location block.

- [ ] **Step 2: Replace the SPA fallback**

In `scripts/nginx/snippets/web-locations.conf`, the `location /` block is currently:

```nginx
location / {
    try_files $uri $uri/ /index.html;
    limit_req zone=general burst=10 nodelay;
}
```

Replace it with:

```nginx
# --- SPA fallback ---------------------------------------------------------------------------
# Static files and the generated catalog pages are served from disk. Only the
# client-side routes fall back to the shell; everything else is a 404.
location / {
    try_files $uri $uri/ @spa;
    limit_req zone=general burst=10 nodelay;
}

location @spa {
    if ($spa_route = 0) { return 404; }
    try_files /index.html =404;
}
```

The `if` with a `return` is one of the two safe uses of `if` in nginx: it runs in the rewrite phase, before `try_files` in the precontent phase, so the 404 happens before the shell is served. The admin paths are inside the map on purpose: the panel app is served from this host too.

The catalog pages are on disk under `dist/`, so `try_files $uri $uri/` finds them and they never reach `@spa`. The per-route directories keep their current behaviour: `/programacion` is a directory, so nginx answers 301 to `/programacion/`, which serves `dist/programacion/index.html`.

- [ ] **Step 3: Verify on the server**

Run on the server, after the config is reloaded:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/no-existe-esta-ruta    # 404
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/programacion/           # 200
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/admin/login           # 200
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/api/nowplaying        # 200
curl -s -o /dev/null -w "%{http_code}\n" https://lavozverdad.com/robots.txt             # 200
```

- [ ] **Step 4: Commit**

```bash
git add scripts/nginx/radio-global.conf scripts/nginx/snippets/web-locations.conf
git commit -m "fix(nginx): answer 404 for unknown public paths"
```

---

### Task 9: The reading of the day, as a React route

One page whose content is "today" cannot be a static file, because the deploy happens on a code change. It stays a React route that fetches the reading at runtime, with per-route head tags.

**Files:**
- Create: `apps/web/src/pages/ReadingTodayPage.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/config/seo.config.ts` (add the route to `PUBLIC_ROUTES` and `ROUTE_META`)
- Test: `apps/web/tests/catalog/readingToday.test.ts`

**Interfaces:**
- Consumes: `GET /api/bible/reading/today` through the existing `@radio/api` client.
- Produces: the route `/lectura-de-hoy/`.

- [ ] **Step 1: Add the route to the SEO config**

In `apps/web/src/config/seo.config.ts`, add `'/lectura-de-hoy'` to `PUBLIC_ROUTES` and its entry to `ROUTE_META` with `kind: 'schedule'`, a title, a description and a daily changefreq. The existing test that checks one title and description per route keeps passing.

- [ ] **Step 2: Write the failing test**

`apps/web/tests/catalog/readingToday.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTES, ROUTE_META, canonicalUrl } from "../../src/config/seo.config";

describe("the reading of the day", () => {
  it("is a public route with its own title and description", () => {
    expect(PUBLIC_ROUTES).toContain("/lectura-de-hoy");
    const meta = ROUTE_META["/lectura-de-hoy"];
    expect(meta.title).toContain("Lectura bíblica");
    expect(canonicalUrl("/lectura-de-hoy")).toBe("https://lavozverdad.com/lectura-de-hoy/");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @radio/web test`
Expected: FAIL, the route is not in `PUBLIC_ROUTES`.

- [ ] **Step 4: Implement `apps/web/src/pages/ReadingTodayPage.tsx`**

The page fetches the reading with the existing api client, shows the rotation name and the chapters with a link to each static chapter page (`/biblia/<bookSlug>/<n>/`), and shows the "Escucha la radio en vivo" player. It follows the loading, empty and error states the other public pages use: while loading it shows the skeleton, when the API answers `reading: null` it says that there is no reading scheduled, and on an error it shows the error message with a retry.

- [ ] **Step 5: Register the route in `apps/web/src/main.tsx`**

```tsx
<Route path="/lectura-de-hoy" element={<ReadingTodayPage />} />
```

inside the `PublicLayout` route group, next to the other public routes.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @radio/web test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/ReadingTodayPage.tsx apps/web/src/main.tsx apps/web/src/config/seo.config.ts apps/web/tests/catalog/readingToday.test.ts
git commit -m "feat(reading): publish the reading of the day"
```

---

### Task 10: The runbook for the manual work

Search Console, the site name, the sitemap submission and the measurement are manual and repeat. They belong in a document, not in a task.

**Files:**
- Create: `docs/runbooks/visibilidad-google.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the runbook.

- [ ] **Step 1: Write the runbook**

It must contain, in this order:

- How to verify the `lavozverdad.com` property in Search Console, with the DNS TXT record, and how to submit `https://lavozverdad.com/sitemap.xml`.
- How to declare the site name at `webmasters.google.com/site-names` ("La Voz de la Verdad") and what it changes in the result.
- How to request reindexing for the eight public routes, and the expectation that the canonical re-evaluation takes up to two weeks.
- How to read the performance report: the queries, the pages, and how the listener count in the admin panel is the real metric.
- The generative AI performance report and the requirement that the site be included in the generative AI features to be eligible for them.
- How to get a PageSpeed Insights API key and what to measure: LCP under 2.5 s, INP under 200 ms, CLS under 0.1, at the 75th percentile.
- The weekly checklist: queries, index coverage, listener count.

- [ ] **Step 2: Commit**

```bash
git add docs/runbooks/visibilidad-google.md
git commit -m "docs: runbook for the Google visibility work"
```

---

## Self-review

**Spec coverage.** The tech foundation (canonical, 404, service worker, sitemap, site name, Core Web Vitals, reindex) is Tasks 0 through 2 and 8. The page engine and the export are Tasks 3, 5 and 6. The published page set (books, chapters, artists, videos) is Task 5. The reading of the day is Task 9. The manual Search Console work is Task 10. The program and sermon pages are deliberately not built: the spec says they wait for a writer, and Task 5 refuses to publish a page with an empty description.

**Step scan.** Every step names a file, a signature and a test. The bodies that remain unwritten are the XML parsing, the HTML layout and the nginx block, which the signatures and the tests do not determine.

**Type consistency.** `Catalog` and its members are defined in Task 2 and used unchanged in Tasks 3, 5 and 6. `PageMeta` and `SitemapEntry` are defined in Task 4 and used in Task 5. `CatalogPage` is defined in Task 5 and consumed in Task 6. `slugifyName` and `uniqueSlugs` are defined in Task 5 and used there and in Task 3's `chapterSlugParts` — note that the backend has its own `slugify` in `shared/utils/text`, and the web one is a separate implementation on purpose: the backend and the web app do not share runtime code beyond `@radio/types`.

**Review Focus.** Line 1 is pinned by the `uniqueSlugs` test. Line 2 by the escaping test in Task 5 and the `buildHeadTagsFor` escaping test in Task 4. Line 3 by the "a chapter with no verses is skipped" rule in Task 3. Line 4 by the "drops the songs without an artist" test in Task 3. Line 5 by the title and description length test in Task 5.

**Proportion.** The plan is longer than the spec because the spec is a vision and this is a sequence of nine changes, each with its own test cycle. It contains no implementation bodies beyond the fixtures and the exact values the tests pin.
