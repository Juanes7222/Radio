import { gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const assetsDir = join(webRoot, "dist", "assets");
const distRoot = join(webRoot, "dist");

// Budgets (Sep 2026): after isolating firebase (~99 KB) and recharts
// (~242 KB) into lazy admin-only chunks, the generic vendor dropped from
// ~591 KB raw / ~170 KB gzip to ~250 KB raw / ~83 KB gzip. The single-file
// ceiling is set so that re-merging those deps into the generic vendor
// (~590 KB) fails. The gzip budget covers the preloaded initial chunks.
const MAX_SINGLE_JS_RAW_BYTES = 400_000;
const MAX_INITIAL_JS_GZIP_BYTES = 340_000;
const MAX_INITIAL_JS_RAW_BYTES = 240_000;
const MAX_CSS_RAW_BYTES = 190_000;
const MAX_TOTAL_DIST_BYTES = 5_500_000;

// The catalog pages are indexable documents, not the bundle the browser
// downloads. The ceiling above keeps the deployed app light and must keep
// doing that job, so the catalog is measured apart from it.
//
// The ceilings below come from a measurement of a full-Bible-shaped artifact
// (66 books, 1,189 chapters of 30 verses, 495 artists, 50 videos): 1,753 pages
// and 17.3 MB in total. A chapter, a book or an artist page weighs 6-14 KB, so
// 40 KB leaves room for a long chapter and fails a page that starts carrying
// the whole catalog.
const MAX_CATALOG_PAGE_BYTES = 40_000;

// The three index pages are lists of everything: the praise index carries one
// line per artist and the video index one per video. They are measured apart
// from the rest, and the ceiling comes from the same measurement.
const MAX_CATALOG_INDEX_PAGE_BYTES = 200_000;

// The catalog as a whole. The measurement is 17.3 MB, so 30 MB leaves the
// library room to grow without turning the deploy into a hundred megabytes.
const MAX_CATALOG_TOTAL_BYTES = 30_000_000;

// The directories the catalog writer fills. The artifact is generated and is
// not committed, so they are absent in a checkout that did not export it.
const CATALOG_DIRS = ["biblia", "alabanza", "videos"] as const;

interface AssetEntry {
  name: string;
  rawBytes: number;
  gzipBytes: number;
}

interface CatalogFile {
  path: string;
  bytes: number;
}

function listFiles(dir: string, extension: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(extension));
}

function measureAsset(dir: string, name: string): AssetEntry {
  const raw = readFileSync(join(dir, name));
  return { name, rawBytes: raw.length, gzipBytes: gzipSync(raw).length };
}

function measureDirTotalBytes(dir: string, skipTopLevel: ReadonlySet<string> = new Set()): number {
  let total = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (skipTopLevel.has(name.name)) continue;
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      total += measureDirTotalBytes(full);
    } else {
      total += statSync(full).size;
    }
  }
  return total;
}

function listFilesRecursively(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursively(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/** Every file of the generated catalog, with its size. Empty without the artifact. */
function listCatalogFiles(): CatalogFile[] {
  const out: CatalogFile[] = [];
  for (const dir of CATALOG_DIRS) {
    const root = join(distRoot, dir);
    if (!existsSync(root)) continue;
    for (const file of listFilesRecursively(root)) {
      out.push({
        path: relative(distRoot, file).split("\\").join("/"),
        bytes: statSync(file).size,
      });
    }
  }
  return out;
}

/** The three index pages of the catalog, the ones that list everything. */
function isIndexPage(path: string): boolean {
  return /^(biblia|alabanza|videos)\/index\.html$/.test(path);
}

function isInitialJsChunk(name: string): boolean {
  // Admin-only vendor splits load on demand with their lazy routes,
  // never with the public first paint (see the test below).
  if (name.startsWith("vendor-firebase") || name.startsWith("vendor-charts")) {
    return false;
  }
  return (
    name.startsWith("vendor-") ||
    name.startsWith("index-") ||
    name === "index.js"
  );
}

describe("bundle budget", () => {
  it("requires a production build before asserting", () => {
    let missing = false;
    try {
      statSync(assetsDir);
    } catch {
      missing = true;
    }
    expect(
      missing,
      "dist/assets not found. Run pnpm --filter @radio/web build first.",
    ).toBe(false);
  });

  it("keeps every emitted JS chunk under the single-file ceiling", () => {
    const entries = listFiles(assetsDir, ".js").map((name) =>
      measureAsset(assetsDir, name),
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(
        entry.rawBytes,
        `${entry.name} raw is ${entry.rawBytes} bytes`,
      ).toBeLessThan(MAX_SINGLE_JS_RAW_BYTES);
    }
  });

  it("keeps the initial JS payload under the gzip budget", () => {
    const entries = listFiles(assetsDir, ".js")
      .filter(isInitialJsChunk)
      .map((name) => measureAsset(assetsDir, name));
    expect(entries.length).toBeGreaterThan(0);
    const totalGzip = entries.reduce((sum, e) => sum + e.gzipBytes, 0);
    expect(
      totalGzip,
      `initial chunks: ${entries.map((e) => `${e.name}=${e.gzipBytes}B gzip`).join(", ")}`,
    ).toBeLessThan(MAX_INITIAL_JS_GZIP_BYTES);
  });

  it("keeps the entry chunk small so first paint stays fast", () => {
    const entries = listFiles(assetsDir, ".js")
      .filter((name) => name.startsWith("index-"))
      .map((name) => measureAsset(assetsDir, name));
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.rawBytes).toBeLessThan(MAX_INITIAL_JS_RAW_BYTES);
    }
  });

  it("keeps admin routes split into lazy chunks", () => {
    const names = listFiles(assetsDir, ".js");
    const adminChunks = names.filter((name) => name.startsWith("Admin"));
    expect(adminChunks.length).toBeGreaterThan(5);
    for (const name of adminChunks) {
      expect(isInitialJsChunk(name)).toBe(false);
    }
  });

  it("keeps admin-only vendor chunks out of the first paint", () => {
    const names = listFiles(assetsDir, ".js");
    const adminVendor = names.filter(
      (name) =>
        name.startsWith("vendor-firebase") || name.startsWith("vendor-charts"),
    );
    // Both splits must exist: firebase serves the admin login only,
    // recharts serves the admin dashboard chart only.
    expect(adminVendor.length).toBeGreaterThanOrEqual(2);
    const indexHtml = readFileSync(join(webRoot, "dist", "index.html"), "utf8");
    for (const chunk of adminVendor) {
      // Strip only the trailing Vite content hash (last dash segment).
      const base = chunk.replace(/-[^-]{6,}\.js$/, "");
      expect(
        indexHtml.includes(base),
        `${chunk} must not be preloaded by dist/index.html`,
      ).toBe(false);
    }
  });

  it("keeps CSS under budget", () => {
    const entries = listFiles(assetsDir, ".css").map((name) =>
      measureAsset(assetsDir, name),
    );
    expect(entries.length).toBeGreaterThan(0);
    const totalRaw = entries.reduce((sum, e) => sum + e.rawBytes, 0);
    expect(totalRaw).toBeLessThan(MAX_CSS_RAW_BYTES);
  });

  it("keeps total dist output under budget", () => {
    // The catalog has its own ceilings below: this one is about the app the
    // browser downloads.
    const total = measureDirTotalBytes(distRoot, new Set(CATALOG_DIRS));
    expect(total).toBeLessThan(MAX_TOTAL_DIST_BYTES);
  });

  it("keeps every generated catalog page under the per-page ceiling", () => {
    const files = listCatalogFiles();
    // The artifact is generated and is not committed, so there is nothing to
    // measure in a checkout that did not export it.
    if (files.length === 0) return;
    for (const file of files) {
      const ceiling = isIndexPage(file.path)
        ? MAX_CATALOG_INDEX_PAGE_BYTES
        : MAX_CATALOG_PAGE_BYTES;
      expect(
        file.bytes,
        `${file.path} is ${file.bytes} bytes`,
      ).toBeLessThan(ceiling);
    }
  });

  it("keeps the generated catalog under the total ceiling", () => {
    const files = listCatalogFiles();
    if (files.length === 0) return;
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    expect(total, `the catalog is ${total} bytes`).toBeLessThan(
      MAX_CATALOG_TOTAL_BYTES,
    );
  });
});
