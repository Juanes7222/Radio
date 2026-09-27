import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_ROUTES,
  ROUTE_META,
  SITE_URL,
  buildSitemapXml,
  canonicalUrl,
} from "../../src/config/seo.config";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const publicDir = join(webRoot, "public");
const assetsDir = join(webRoot, "dist", "assets");
const distDir = join(webRoot, "dist");
const indexHtmlPath = join(webRoot, "index.html");

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
// The Open Graph card is a different asset class from the PWA icon set: a
// 1200x630 social preview with a smooth gradient costs ~215 KB where the
// largest icon is 75 KB. It is only fetched when someone shares a link, so it
// gets its own ceiling instead of inflating the one that keeps the icon set
// lean.
const OG_IMAGE_FILE = "og-image.png";
const MAX_OG_IMAGE_BYTES = 260_000;
const OG_IMAGE_DIMENSIONS = { width: 1200, height: 630 };

/** Paths allowed to exceed MAX_PUBLIC_FILE_BYTES, with their own budgets. */
const CEILING_EXEMPTIONS: Readonly<Record<string, number>> = {
  [OG_IMAGE_FILE]: MAX_OG_IMAGE_BYTES,
};

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
      const ceiling = CEILING_EXEMPTIONS[file.name] ?? MAX_PUBLIC_FILE_BYTES;
      expect(file.bytes, `${file.name} is ${file.bytes} bytes`).toBeLessThan(
        ceiling,
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

/**
 * The social preview tags in index.html. Reading them here is what the suite
 * was missing when og:image pointed at /icon-512x512.png, a path that has
 * never existed: the manifest check only looked at manifest.json, so the dead
 * reference shipped unnoticed and link previews rendered imageless.
 */
const OG_IMAGE_REFERENCE_PATTERN = /<meta[^>]+property="og:image"[^>]+content="([^"]*)"/g;
const TWITTER_IMAGE_REFERENCE_PATTERN = /<meta[^>]+name="twitter:image"[^>]+content="([^"]*)"/g;
const CANONICAL_PATTERN = /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/g;
const TITLE_PATTERN = /<title>([^<]*)<\/title>/g;
const DESCRIPTION_PATTERN = /<meta[^>]+name="description"[^>]+content="([^"]*)"/g;

function collectMatches(html: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const value = match[1];
    if (value !== undefined) out.push(value);
  }
  return out;
}

function distIndexPathForRoute(route: string): string {
  return route === "/"
    ? join(distDir, "index.html")
    : join(distDir, route.replace(/^\//, ""), "index.html");
}

describe("seo metadata", () => {
  it("declares a unique non-empty title and description per public route", () => {
    const titles = PUBLIC_ROUTES.map((route) => ROUTE_META[route].title);
    const descriptions = PUBLIC_ROUTES.map((route) => ROUTE_META[route].description);

    // A shared title across every route is exactly the bug this config exists
    // to prevent: one index.html used to describe all seven URLs.
    expect(new Set(titles).size).toBe(PUBLIC_ROUTES.length);
    expect(new Set(descriptions).size).toBe(PUBLIC_ROUTES.length);

    for (const route of PUBLIC_ROUTES) {
      const meta = ROUTE_META[route];
      expect(meta.title.length, route).toBeGreaterThan(10);
      expect(meta.description.length, route).toBeGreaterThan(50);
      // Google truncates titles past ~60 chars and descriptions past ~160.
      expect(meta.title.length, route).toBeLessThanOrEqual(70);
      expect(meta.description.length, route).toBeLessThanOrEqual(200);
    }
  });

  it("points every social image at an existing absolute file", () => {
    const html = readFileSync(indexHtmlPath, "utf8");
    const references = [
      ...collectMatches(html, OG_IMAGE_REFERENCE_PATTERN),
      ...collectMatches(html, TWITTER_IMAGE_REFERENCE_PATTERN),
    ];

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference, "Open Graph requires absolute URLs").toMatch(
        /^https?:\/\//,
      );
      const path = new URL(reference).pathname;
      expect(path.startsWith("/"), reference).toBe(true);
      expect(
        existsSync(join(publicDir, path)),
        `${reference} -> ${path} is missing from public/`,
      ).toBe(true);
    }
  });

  it("sizes the social image for a link preview", () => {
    expect(existsSync(join(publicDir, OG_IMAGE_FILE))).toBe(true);
    const html = readFileSync(indexHtmlPath, "utf8");
    expect(html).toContain(`property="og:image:width" content="${OG_IMAGE_DIMENSIONS.width}"`);
    expect(html).toContain(`property="og:image:height" content="${OG_IMAGE_DIMENSIONS.height}"`);

    // PNG header carries the real dimensions, so this catches an export that
    // does not match the declared tags.
    const png = readFileSync(join(publicDir, OG_IMAGE_FILE));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    expect(width).toBe(OG_IMAGE_DIMENSIONS.width);
    expect(height).toBe(OG_IMAGE_DIMENSIONS.height);
  });

  it("keeps the static index.html fallbacks aligned with the route config", () => {
    const html = readFileSync(indexHtmlPath, "utf8");
    const [title] = collectMatches(html, TITLE_PATTERN);
    const [description] = collectMatches(html, DESCRIPTION_PATTERN);
    const [canonical] = collectMatches(html, CANONICAL_PATTERN);

    expect(title).toBe(ROUTE_META["/"].title);
    expect(description).toBe(ROUTE_META["/"].description);
    expect(canonical).toBe(canonicalUrl("/"));
  });

  it("blocks admin and backend paths in robots.txt and names the sitemap", () => {
    const robots = readFileSync(join(publicDir, "robots.txt"), "utf8");
    for (const blocked of ["/admin", "/admin-api/", "/internal/", "/panel-api/"]) {
      expect(robots, `robots.txt must disallow ${blocked}`).toContain(
        `Disallow: ${blocked}`,
      );
    }
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  it("lists every public route in the sitemap", () => {
    const sitemap = buildSitemapXml(new Date("2026-09-27T00:00:00Z"));
    for (const route of PUBLIC_ROUTES) {
      expect(sitemap, `sitemap is missing ${route}`).toContain(
        `<loc>${canonicalUrl(route)}</loc>`,
      );
    }
    expect(sitemap).toContain("<lastmod>2026-09-27</lastmod>");
  });
});

describe("per-route build output", () => {
  it("emits an HTML file per public route with its own metadata", () => {
    let missing = false;
    try {
      statSync(distDir);
    } catch {
      missing = true;
    }
    expect(
      missing,
      "dist not found. Run pnpm --filter @radio/web build first.",
    ).toBe(false);
    if (missing) return;

    for (const route of PUBLIC_ROUTES) {
      const path = distIndexPathForRoute(route);
      expect(existsSync(path), `${route} -> ${path} was not emitted`).toBe(true);

      const html = readFileSync(path, "utf8");
      expect(collectMatches(html, TITLE_PATTERN), route).toEqual([
        ROUTE_META[route].title,
      ]);
      expect(collectMatches(html, CANONICAL_PATTERN), route).toEqual([
        canonicalUrl(route),
      ]);
      expect(collectMatches(html, OG_IMAGE_REFERENCE_PATTERN), route).toHaveLength(1);
      // The markers are build directives, not content; they must not survive.
      expect(html, route).not.toContain("seo:head");
      expect(html, route).not.toContain("seo:social");
      expect(html, route).not.toContain("seo:jsonld");
    }
  });

  it("writes a sitemap that matches the canonical host", () => {
    const sitemapPath = join(distDir, "sitemap.xml");
    if (!existsSync(sitemapPath)) return;
    const sitemap = readFileSync(sitemapPath, "utf8");
    expect(sitemap).toContain(`<loc>${SITE_URL}/</loc>`);
    expect(sitemap).not.toContain("vozyverdad.com");
  });
});
