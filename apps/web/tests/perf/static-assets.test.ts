import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = join(webRoot, "public");
const assetsDir = join(webRoot, "dist", "assets");

// Baselines from Sep 2026: public/ was trimmed from ~1.5 MB to ~0.3 MB by
// deleting the unreferenced favicon.svg (214 KB base64-raster wrapper),
// android-chrome/web-app-manifest duplicates and one-per-size apple icons.
// The 512px PWA icon dropped from 243 KB to ~57 KB via lossless recompress.
// Bundled fonts dropped from ~507 KB to ~287 KB via latin-only subsets.
const MAX_PUBLIC_FILE_BYTES = 150_000;
const MAX_PUBLIC_SVG_BYTES = 50_000;
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
  // Strip only the trailing Vite content hash (last dash segment).
  const withoutHash = base.replace(/-[^-]{6,}$/, "");
  return `${withoutHash}${ext}`;
}

function logoBase(name: string): string | null {
  const upper = name.toUpperCase();
  if (!upper.includes("LOGO")) return null;
  const stripped = stripHash(name);
  return stripped.replace(/\.(webp|png|jpg|jpeg|avif)$/i, "").toUpperCase();
}

interface ManifestIcon {
  src?: unknown;
}

interface ManifestShortcut {
  icons?: unknown;
}

interface WebManifest {
  icons?: unknown;
  shortcuts?: unknown;
}

// Collects every icon src declared by the web manifest (top-level icons
// plus shortcut icons) so the suite fails on dangling references like the
// missing /icon-512x512.png that shipped unnoticed.
function collectManifestSources(manifest: unknown): string[] {
  if (typeof manifest !== "object" || manifest === null) return [];
  const root = manifest as WebManifest;
  const out: string[] = [];
  const pushSources = (icons: unknown): void => {
    if (!Array.isArray(icons)) return;
    for (const icon of icons) {
      if (typeof icon !== "object" || icon === null) continue;
      const src = (icon as ManifestIcon).src;
      if (typeof src === "string" && src.startsWith("/")) {
        out.push(src.slice(1));
      }
    }
  };
  pushSources(root.icons);
  if (Array.isArray(root.shortcuts)) {
    for (const shortcut of root.shortcuts) {
      if (typeof shortcut !== "object" || shortcut === null) continue;
      pushSources((shortcut as ManifestShortcut).icons);
    }
  }
  return out;
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

  it("rejects heavyweight svg wrappers", () => {
    // A base64-raster svg favicon (214 KB) once lived here unreferenced.
    const svgs = sizedFilesIn(publicDir).filter((f) => f.name.endsWith(".svg"));
    for (const svg of svgs) {
      expect(svg.bytes, svg.name).toBeLessThan(MAX_PUBLIC_SVG_BYTES);
    }
  });

  it("keeps every manifest icon on disk", () => {
    const manifest = JSON.parse(
      readFileSync(join(publicDir, "manifest.json"), "utf8"),
    ) as unknown;
    const sources = collectManifestSources(manifest);
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      expect(existsSync(join(publicDir, src)), `manifest ${src}`).toBe(true);
    }
  });

  it("keeps every service-worker precached asset on disk", () => {
    const sw = readFileSync(join(publicDir, "sw.js"), "utf8");
    const paths = sw
      .split("\n")
      .map((line) => line.trim().match(/^'(\/[^'?]+)',?$/))
      .filter((m) => m !== null)
      .map((m) => (m as RegExpMatchArray)[1])
      // The navigation route and its build-time HTML have no file on disk.
      .filter((assetPath) => assetPath !== "/" && assetPath !== "/index.html");
    expect(paths.length).toBeGreaterThan(0);
    for (const assetPath of paths) {
      expect(existsSync(join(publicDir, assetPath)), `sw.js ${assetPath}`).toBe(
        true,
      );
    }
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
