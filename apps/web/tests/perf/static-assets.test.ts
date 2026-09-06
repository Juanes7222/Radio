import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = join(webRoot, "public");
const assetsDir = join(webRoot, "dist", "assets");

// Baselines from Sep 2026: largest public file is the 512px icon (~438 KB),
// favicon.svg is ~214 KB unoptimized. Bundled fonts dropped from ~507 KB to
// ~287 KB by importing Mono/Serif latin-only subsets; the variable Sans keeps
// all subsets on disk but browsers fetch only latin via unicode-range.
const MAX_PUBLIC_FILE_BYTES = 500_000;
const MAX_FAVICON_SVG_BYTES = 250_000;
const MAX_BUNDLED_FONTS_BYTES = 350_000;
const MAX_LOGO_VARIANTS_PER_BASE = 3;
const MAX_PNG_FALLBACK_BYTES = 60_000;

interface SizedFile {
  name: string;
  bytes: number;
}

function sizedFilesIn(dir: string): SizedFile[] {
  return readdirSync(dir)
    .map((name) => ({ name, bytes: statSync(join(dir, name)).size }))
    .filter((entry) => statSync(join(dir, entry.name)).isFile());
}

function stripHash(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot) : "";
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const withoutHash = base.replace(/-[A-Za-z0-9_-]{6,}$/, "");
  return `${withoutHash}${ext}`;
}

function logoBase(name: string): string | null {
  const upper = name.toUpperCase();
  if (!upper.includes("LOGO")) return null;
  const stripped = stripHash(name);
  return stripped.replace(/\.(webp|png|jpg|jpeg|avif)$/i, "").toUpperCase();
}

describe("static assets", () => {
  it("keeps every public file under the single-file ceiling", () => {
    const files = sizedFilesIn(publicDir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file.bytes, `${file.name} is ${file.bytes} bytes`).toBeLessThan(
        MAX_PUBLIC_FILE_BYTES,
      );
    }
  });

  it("flags favicon.svg growth", () => {
    const files = sizedFilesIn(publicDir);
    const favicon = files.find((f) => f.name === "favicon.svg");
    if (!favicon) return;
    expect(favicon.bytes).toBeLessThan(MAX_FAVICON_SVG_BYTES);
  });

  it("keeps bundled fonts under budget", () => {
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
    if (missing) return;
    const fonts = sizedFilesIn(assetsDir).filter((f) =>
      /\.(woff2?|ttf|otf)$/i.test(f.name),
    );
    const total = fonts.reduce((sum, f) => sum + f.bytes, 0);
    expect(total).toBeLessThan(MAX_BUNDLED_FONTS_BYTES);
  });

  it("avoids unbounded logo duplicates in the bundle", () => {
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
    if (missing) return;
    const logos = sizedFilesIn(assetsDir).filter((f) => logoBase(f.name) !== null);
    const byBase = new Map<string, SizedFile[]>();
    for (const file of logos) {
      const base = logoBase(file.name) ?? file.name;
      const group = byBase.get(base) ?? [];
      group.push(file);
      byBase.set(base, group);
    }
    for (const [base, group] of byBase) {
      expect(group.length, `${base}: ${group.map((g) => g.name).join(", ")}`).toBeLessThanOrEqual(
        MAX_LOGO_VARIANTS_PER_BASE,
      );
      for (const file of group) {
        if (/\.png$/i.test(file.name)) {
          expect(file.bytes, file.name).toBeLessThan(MAX_PNG_FALLBACK_BYTES);
        }
      }
    }
  });
});
