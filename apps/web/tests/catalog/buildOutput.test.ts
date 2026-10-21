import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { build } from "vite";
import type { Catalog } from "@radio/types";
import { catalogArtifactPath, defaultCatalogPath, perRouteSeoPlugin } from "../../vite/seoPlugin";

const webRoot = join(__dirname, "..", "..");
const distDir = join(webRoot, "dist");
const indexHtmlPath = join(webRoot, "index.html");

// The catalog artifact is written by the backend export, which needs AzuraCast
// and the database, and it is not committed. The build writes the catalog only
// when the export ran, so the assertions on the build output run only in that
// case. The ones on the plugin below run always: they build a fixture.
const catalogIndexPath = join(distDir, "biblia", "index.html");

// One book with one chapter is enough to prove that the build writes the pages
// and the sitemap entries. The `satisfies` ties the fixture to the type of the
// artifact: a change to `Catalog` has to reach the fixture too.
const CATALOG_FIXTURE = {
  generatedAt: "2026-10-21T00:00:00.000Z",
  translation: { abbreviation: "RVG2004", name: "Reina-Valera Gomez 2004" },
  books: [{ slug: "job", name: "Job", order: 18, testament: "AT", chapterCount: 1 }],
  chapters: [
    { bookSlug: "job", number: 1, verses: [{ number: 1, text: "Habia en la tierra de Uz" }] },
  ],
  artists: [],
  videos: [],
} satisfies Catalog;

describe("catalog build output", () => {
  it("writes a page per chapter with its canonical", () => {
    const path = join(distDir, "biblia", "job", "1", "index.html");
    if (!existsSync(path)) return; // the catalog is not exported in this environment
    const html = readFileSync(path, "utf8");
    expect(html).toContain('<link rel="canonical" href="https://lavozverdad.com/biblia/job/1/" />');
    expect(html).toContain("Escucha la radio en vivo");
  });

  it("lists the catalog pages in the sitemap", () => {
    if (!existsSync(catalogIndexPath)) return; // the catalog is not exported in this environment
    const path = join(distDir, "sitemap.xml");
    if (!existsSync(path)) return;
    const sitemap = readFileSync(path, "utf8");
    expect(sitemap).toContain("<loc>https://lavozverdad.com/biblia/</loc>");
  });
});

const tempRoots: string[] = [];
const originalCatalogPath = process.env.CATALOG_PATH;

interface PluginBuild {
  readonly outDir: string;
  /** The artifact the build looked for, the one that is missing when there is none. */
  readonly artifactPath: string;
}

/**
 * Runs the plugin in a real Vite build over a temporary directory, with the
 * fixture catalog or with an artifact that is not there.
 */
async function buildWithPlugin(catalog: Catalog | null): Promise<PluginBuild> {
  return buildWithArtifact(catalog === null ? null : JSON.stringify(catalog));
}

/**
 * The same build with the bytes of the artifact, for the artifacts that are
 * not a catalog.
 */
async function buildWithArtifact(content: string | null): Promise<PluginBuild> {
  const root = mkdtempSync(join(tmpdir(), "radio-catalog-"));
  tempRoots.push(root);
  const outDir = join(root, "dist");

  // The template is the real index.html without its module script: the plugin
  // has to work on the template of the app, but the build must not need the
  // application to run.
  const template = readFileSync(indexHtmlPath, "utf8").replace(
    /<script type="module"[^>]*><\/script>/,
    "",
  );
  writeFileSync(join(root, "index.html"), template);

  let artifactPath: string;
  if (content === null) {
    // A path that is not there. The artifact of the app may be exported, and
    // the build must not depend on that.
    artifactPath = join(root, "missing", "catalog.json");
  } else {
    artifactPath = join(root, "catalog.json");
    writeFileSync(artifactPath, content);
  }
  process.env.CATALOG_PATH = artifactPath;

  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [perRouteSeoPlugin()],
    build: {
      outDir,
      write: true,
      rollupOptions: { input: join(root, "index.html") },
    },
  });

  return { outDir, artifactPath };
}

afterEach(() => {
  if (originalCatalogPath === undefined) {
    delete process.env.CATALOG_PATH;
  } else {
    process.env.CATALOG_PATH = originalCatalogPath;
  }
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("the catalog writer of the build", () => {
  it("writes a page per chapter and lists it in the sitemap", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { outDir } = await buildWithPlugin(CATALOG_FIXTURE);

    const page = join(outDir, "biblia", "job", "1", "index.html");
    expect(existsSync(page)).toBe(true);
    const html = readFileSync(page, "utf8");
    expect(html).toContain('<link rel="canonical" href="https://lavozverdad.com/biblia/job/1/" />');
    expect(html).toContain("Escucha la radio en vivo");

    const sitemap = readFileSync(join(outDir, "sitemap.xml"), "utf8");
    expect(sitemap).toContain("<loc>https://lavozverdad.com/biblia/job/1/</loc>");
    expect(sitemap).toContain("<loc>https://lavozverdad.com/biblia/</loc>");
  });

  it("keeps the public routes and the sitemap when the artifact is absent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { outDir, artifactPath } = await buildWithPlugin(null);

    // The warning names the missing path, so the deploy log says what is gone.
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain(artifactPath);

    expect(existsSync(join(outDir, "programacion", "index.html"))).toBe(true);
    const sitemap = readFileSync(join(outDir, "sitemap.xml"), "utf8");
    expect(sitemap).toContain("<loc>https://lavozverdad.com/</loc>");
    expect(sitemap).toContain("<loc>https://lavozverdad.com/programacion/</loc>");
    expect(sitemap).not.toContain("/biblia/");
  });

  // A worker thread has no process.chdir, and the check needs a working
  // directory other than the one of the app to mean anything.
  it.skipIf(typeof process.chdir !== "function")(
    "resolves the artifact from the app root and not from the working directory",
    () => {
      const previous = process.cwd();
      try {
        process.chdir(tmpdir());
        expect(defaultCatalogPath()).toBe(join(webRoot, "catalog", "catalog.json"));
      } finally {
        process.chdir(previous);
      }
    },
  );

  it.skipIf(typeof process.chdir !== "function")(
    "resolves a relative override against the app root and not the working directory",
    () => {
      process.env.CATALOG_PATH = join("catalog", "catalog.json");
      const previous = process.cwd();
      try {
        process.chdir(tmpdir());
        expect(catalogArtifactPath()).toBe(join(webRoot, "catalog", "catalog.json"));
      } finally {
        process.chdir(previous);
      }
    },
  );

  it("keeps an absolute override as it is", () => {
    const absolute = join(tmpdir(), "elsewhere", "catalog.json");
    process.env.CATALOG_PATH = absolute;
    expect(catalogArtifactPath()).toBe(absolute);
  });

  it("stops the build naming the file when the artifact is not JSON", async () => {
    const error = await buildWithArtifact("{ this is not json").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("[catalog] Cannot read the artifact at");
    expect(message).toContain("catalog.json");
  });

  it("stops the build naming the field when the artifact is not a catalog", async () => {
    const drifted = JSON.stringify({ ...CATALOG_FIXTURE, books: "not an array" });
    const error = await buildWithArtifact(drifted).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("[catalog] The artifact at");
    expect(message).toContain("catalog.json");
    expect(message).toContain("books is not an array");
  });

  it("stops the build naming the field when the artifact is missing a field", async () => {
    const withoutBooks: Record<string, unknown> = { ...CATALOG_FIXTURE };
    delete withoutBooks.books;
    const error = await buildWithArtifact(JSON.stringify(withoutBooks)).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("[catalog] The artifact at");
    expect(message).toContain("books is missing");
  });
});
