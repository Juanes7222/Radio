/**
 * The build-time writers of the public site: the per-route HTML, the catalog
 * pages and the sitemap.
 *
 * The sitemap has exactly one writer, and it is this file: `robots.txt` points
 * at `dist/sitemap.xml` and the perf suite requires it to carry every public
 * route, so the catalog pages and the sitemap are written by the same plugin.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import type { Catalog } from "@radio/types";
import {
  PUBLIC_ROUTES,
  absoluteUrl,
  buildHeadTags,
  buildJsonLd,
  buildSitemapXml,
  buildSocialTags,
  isPublicRoute,
  normalizePathname,
  type PublicRoute,
  type SitemapEntry,
} from "../src/config/seo.config";
import { buildCatalogPages, renderCatalogDocument } from "../src/content/catalogPages";
import { BOOK_SLUGS_PATH } from "../src/config/catalog";

// The public site is a client-rendered SPA, so every URL used to be served the
// same dist/index.html and therefore the same <head>. These markers delimit the
// three blocks that the build rewrites per route, so the substitution is
// deterministic instead of a regex over the whole document.
const SEO_BLOCKS = {
  head: { open: "<!--seo:head-->", close: "<!--/seo:head-->" },
  social: { open: "<!--seo:social-->", close: "<!--/seo:social-->" },
  jsonld: { open: "<!--seo:jsonld-->", close: "<!--/seo:jsonld-->" },
} as const

type SeoBlockName = keyof typeof SEO_BLOCKS

function replaceSeoBlock(html: string, block: SeoBlockName, content: string): string {
  const { open, close } = SEO_BLOCKS[block]
  const start = html.indexOf(open)
  const end = html.indexOf(close)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`index.html is missing the ${open} ... ${close} markers`)
  }
  // The markers are replaced along with their contents: they are build
  // directives and must not survive into the emitted HTML. Safe to strip
  // because writeBundle always reads the template Vite just produced from
  // index.html, never its own output.
  return `${html.slice(0, start)}\n    ${content}\n    ${html.slice(end + close.length)}`
}

function renderRouteHtml(template: string, route: PublicRoute): string {
  return replaceSeoBlock(
    replaceSeoBlock(
      replaceSeoBlock(template, "head", buildHeadTags(route)),
      "social",
      buildSocialTags(route),
    ),
    "jsonld",
    buildJsonLd(route),
  )
}

/**
 * The root of the web app: the directory that holds `catalog/` and `public/`.
 */
const APP_ROOT = path.resolve(__dirname, "..");

/**
 * The catalog artifact of the app, resolved from the directory of the plugin
 * and not from the working directory: the build can be run from anywhere.
 */
export function defaultCatalogPath(): string {
  return path.join(APP_ROOT, "catalog", "catalog.json");
}

/**
 * The artifact the build reads. `CATALOG_PATH` overrides it, and a relative
 * override is resolved against the app root, so the override does not depend
 * on the working directory either.
 */
export function catalogArtifactPath(): string {
  const configured = (process.env.CATALOG_PATH ?? "").trim();
  if (!configured) return defaultCatalogPath();
  return path.resolve(APP_ROOT, configured);
}

/**
 * The fields the artifact has to carry, with the kind each one has to be.
 *
 * The artifact crosses a process boundary: the export is another program and
 * another version, so a drifted shape has to be reported here and not as a
 * crash inside the generator. The check covers the top level only; the nested
 * shapes are the generator's business.
 */
const CATALOG_FIELDS: readonly {
  readonly name: string;
  readonly expected: string;
  readonly is: (value: unknown) => boolean;
}[] = [
  { name: "generatedAt", expected: "a string", is: (value) => typeof value === "string" },
  { name: "translation", expected: "an object", is: (value) => typeof value === "object" && value !== null },
  { name: "books", expected: "an array", is: (value) => Array.isArray(value) },
  { name: "chapters", expected: "an array", is: (value) => Array.isArray(value) },
  { name: "artists", expected: "an array", is: (value) => Array.isArray(value) },
  { name: "videos", expected: "an array", is: (value) => Array.isArray(value) },
];

/** Reports an artifact that is not a catalog, naming what is wrong and where. */
function assertCatalog(value: unknown, source: string): Catalog {
  if (typeof value !== "object" || value === null) {
    throw new Error(`[catalog] The artifact at ${source} is not a catalog: it is not an object.`);
  }

  const record = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const field of CATALOG_FIELDS) {
    const found = record[field.name];
    if (found === undefined) {
      problems.push(`${field.name} is missing`);
    } else if (!field.is(found)) {
      problems.push(`${field.name} is not ${field.expected}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`[catalog] The artifact at ${source} is not a catalog: ${problems.join("; ")}.`);
  }

  return value as Catalog;
}

/**
 * Reads the artifact and checks that it is a catalog.
 *
 * A file that cannot be read, cannot be parsed or is not a catalog stops the
 * build. That path deliberately stops the deploy, so the message is the whole
 * diagnostic the operator gets: it names the file.
 */
async function readCatalog(source: string): Promise<Catalog> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(source, "utf8"));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`[catalog] Cannot read the artifact at ${source}: ${detail}`, { cause });
  }
  return assertCatalog(parsed, source);
}

/**
 * Writes the generated pages and returns the sitemap entries they carry.
 *
 * The artifact is optional: it is produced by the backend export, which needs
 * AzuraCast and the database. A build without it still ships a valid sitemap
 * with the public routes, and it says so in the deploy log.
 */
async function writeCatalogPages(outDir: string): Promise<SitemapEntry[]> {
  const source = catalogArtifactPath()
  if (!existsSync(source)) {
    console.warn(
      `[catalog] No artifact at ${source}: the build ships only the public routes. ` +
        `Run "pnpm --filter @radio/backend run catalog:export" to generate it.`,
    )
    return []
  }

  const catalog = await readCatalog(source)
  const entries: SitemapEntry[] = []

  for (const page of buildCatalogPages(catalog)) {
    // The page path starts and ends with a slash, so the file lands in
    // dist/<path>/index.html, which is the form nginx resolves.
    const pageDir = path.join(outDir, page.path)
    await mkdir(pageDir, { recursive: true })
    await writeFile(path.join(pageDir, "index.html"), renderCatalogDocument(page))
    entries.push({
      loc: absoluteUrl(page.path),
      priority: page.priority,
      changefreq: page.changefreq,
      lastmod: page.lastmod,
    })
  }

  await writeBookSlugs(outDir, catalog)
  console.log(`[catalog] ${entries.length} pages written from ${source}`)
  return entries
}

/**
 * Writes the map of the published books next to the pages it writes.
 *
 * The runtime links a chapter to the page the build published, and the
 * artifact is what owns the slugs: the web app reads them from here instead
 * of deriving them. The map exists only when the catalog was written, so a
 * build without the artifact has no map and the chapters of the reading are
 * rendered without a link.
 */
async function writeBookSlugs(outDir: string, catalog: Catalog): Promise<void> {
  const slugs: Record<string, string> = {};
  for (const book of catalog.books) {
    slugs[book.name] = book.slug;
  }

  const target = path.join(outDir, BOOK_SLUGS_PATH);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(slugs));
}

/**
 * Emits dist/<route>/index.html for every public route, the catalog pages and
 * the sitemap. nginx resolves /programacion to dist/programacion/index.html
 * through `try_files $uri $uri/`, so no server change is needed to serve them.
 */
export function perRouteSeoPlugin(): Plugin {
  return {
    name: "radio:per-route-seo",
    apply: "build",
    async writeBundle(options) {
      const outDir = options.dir
      if (outDir === undefined) {
        throw new Error("radio:per-route-seo needs an output directory")
      }
      const indexPath = path.join(outDir, "index.html")
      const template = await readFile(indexPath, "utf8")

      for (const route of PUBLIC_ROUTES) {
        const html = renderRouteHtml(template, route)
        if (route === "/") {
          await writeFile(indexPath, html)
          continue
        }
        const routeDir = path.join(outDir, route)
        await mkdir(routeDir, { recursive: true })
        await writeFile(path.join(routeDir, "index.html"), html)
      }

      const entries = await writeCatalogPages(outDir)
      const sitemap = buildSitemapXml(new Date(), entries)
      await writeFile(path.join(outDir, "sitemap.xml"), sitemap)
    },
  }
}

/** Keeps `vite dev` serving the same head a production build would. */
export function devRouteSeoPlugin(): Plugin {
  return {
    name: "radio:dev-route-seo",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // In dev Vite normalises ctx.path to /index.html for every navigation,
        // so the requested route only survives in originalUrl.
        const route = normalizePathname(ctx.originalUrl || ctx.path || "/")
        return isPublicRoute(route) ? renderRouteHtml(html, route) : html
      },
    },
  }
}
