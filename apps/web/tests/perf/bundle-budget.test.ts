import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
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

interface AssetEntry {
  name: string;
  rawBytes: number;
  gzipBytes: number;
}

function listFiles(dir: string, extension: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(extension));
}

function measureAsset(dir: string, name: string): AssetEntry {
  const raw = readFileSync(join(dir, name));
  return { name, rawBytes: raw.length, gzipBytes: gzipSync(raw).length };
}

function measureDirTotalBytes(dir: string): number {
  let total = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      total += measureDirTotalBytes(full);
    } else {
      total += statSync(full).size;
    }
  }
  return total;
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
    const total = measureDirTotalBytes(distRoot);
    expect(total).toBeLessThan(MAX_TOTAL_DIST_BYTES);
  });
});
