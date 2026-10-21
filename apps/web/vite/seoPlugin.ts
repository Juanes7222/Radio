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
 * The catalog artifact of the app, resolved from the directory of the plugin
 * and not from the working directory: the build can be run from anywhere.
 */
export function defaultCatalogPath(): string {
  return path.resolve(__dirname, "..", "catalog", "catalog.json")
}

function catalogArtifactPath(): string {
  // CATALOG_PATH overrides the artifact, for a build that reads it from
  // somewhere else.
  const configured = (process.env.CATALOG_PATH ?? "").trim()
  return configured ? path.resolve(configured) : defaultCatalogPath()
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

  const catalog = JSON.parse(await readFile(source, "utf8")) as Catalog
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

  console.log(`[catalog] ${entries.length} pages written from ${source}`)
  return entries
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
