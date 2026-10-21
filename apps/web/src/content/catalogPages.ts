/**
 * The catalog pages: the artifact written by the backend export becomes a
 * list of pages with their metadata and their HTML.
 *
 * The documents are static and never hydrate, so the body is plain HTML and
 * the player is an `<audio>` element. Every text that reaches a document goes
 * through the escaper of the SEO config, because the verse text and the song
 * titles come from outside this app.
 */

import type {
  Catalog,
  CatalogArtist,
  CatalogBook,
  CatalogChapter,
  CatalogVerse,
  CatalogVideo,
} from "@radio/types";
import {
  SITE_URL,
  STREAM_URL,
  buildHeadTagsFor,
  buildSocialTagsFor,
  escapeHtml,
  organizationNodes,
  type PageMeta,
} from "../config/seo.config";

/** Google truncates a title past ~70 characters and a description past ~160. */
const MAX_TITLE_LENGTH = 70;
const MAX_DESCRIPTION_LENGTH = 160;

export type CatalogChangefreq = "daily" | "weekly" | "monthly" | "yearly";

export interface CatalogPage {
  /** The path of the page, with a leading and a trailing slash. */
  readonly path: string;
  readonly title: string;
  readonly description: string;
  /** The headline of the page. The document's `<h1>` reuses it. */
  readonly ogTitle: string;
  readonly jsonLd: string;
  /** The inner HTML of `<main>`. */
  readonly body: string;
  /** "YYYY-MM-DD" */
  readonly lastmod: string;
  readonly priority: number;
  readonly changefreq: CatalogChangefreq;
}

/** The canonical of a generated page: the site plus a path that ends with a slash. */
function canonicalOf(path: string): string {
  return `${SITE_URL}${path}`;
}

/** Shortens a text to a maximum length, cutting at a word boundary. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.max(max - 1, 0)).trimEnd();
  const boundary = head.lastIndexOf(" ");
  return `${boundary > 0 ? head.slice(0, boundary) : head}…`;
}

/** Fits a head and a tail into a maximum length, shortening the head first. */
function fit(head: string, tail: string, max: number): string {
  if (tail.length >= max) return clip(`${head} ${tail}`.trim(), max);
  return `${clip(head, max - tail.length)}${tail}`;
}

/**
 * JSON-LD is embedded in a `<script>` element, where a `<` would close the
 * tag. The unicode escape keeps the document valid and the JSON parseable.
 */
function scriptSafe(json: string): string {
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function jsonLdOf(node: Record<string, unknown>): string {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [...organizationNodes(), node],
  };
  return scriptSafe(JSON.stringify(graph, null, 2));
}

function lastmodOf(catalog: Catalog): string {
  return catalog.generatedAt.slice(0, 10);
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** The play control every generated page carries. */
function playerMarkup(): string {
  return [
    '<section class="player">',
    "  <h2>Escucha la radio en vivo</h2>",
    `  <audio controls preload="none" src="${escapeHtml(STREAM_URL)}"></audio>`,
    `  <p><a href="${escapeHtml(SITE_URL)}/">Abrir la consola de La Voz de la Verdad</a></p>`,
    "</section>",
  ].join("\n");
}

/** Links to the other sections of the catalog, so a crawler reaches all of them. */
function sectionsMarkup(catalog: Catalog, current: "biblia" | "alabanza" | "videos"): string {
  const links: string[] = [];
  if (current !== "biblia") {
    links.push('<li><a href="/biblia/">La Biblia en español</a></li>');
  }
  if (current !== "alabanza") {
    links.push('<li><a href="/alabanza/">Canciones de alabanza</a></li>');
  }
  if (current !== "videos" && catalog.videos.length > 0) {
    links.push('<li><a href="/videos/">Videos y predicaciones</a></li>');
  }
  return [
    '<nav class="sections" aria-label="Otras secciones">',
    "  <ul>",
    `    ${links.join("\n    ")}`,
    "  </ul>",
    "</nav>",
  ].join("\n");
}

/** The YouTube address of a video. The pages link to it; they never embed it. */
function videoUrl(video: CatalogVideo): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;
}

function versesMarkup(verses: readonly CatalogVerse[]): string {
  const items = verses
    .map(
      (verse) =>
        `<p class="verse"><sup class="verse-number">${verse.number}</sup>${escapeHtml(verse.text)}</p>`,
    )
    .join("\n");
  return ['<div class="verses">', items, "</div>"].join("\n");
}

function chaptersMarkup(book: CatalogBook, chapters: readonly CatalogChapter[]): string {
  const items = chapters
    .map(
      (chapter) =>
        `<li><a href="/biblia/${escapeHtml(book.slug)}/${chapter.number}/">${escapeHtml(book.name)} ${chapter.number}</a></li>`,
    )
    .join("\n");
  return [
    `<nav class="chapters" aria-label="Capítulos de ${escapeHtml(book.name)}">`,
    `  <h2>Capítulos de ${escapeHtml(book.name)}</h2>`,
    "  <ul>",
    items,
    "  </ul>",
    "</nav>",
  ].join("\n");
}

function chapterPage(
  catalog: Catalog,
  book: CatalogBook,
  chapter: CatalogChapter,
  siblings: readonly CatalogChapter[],
): CatalogPage {
  const path = `/biblia/${book.slug}/${chapter.number}/`;
  const bookPath = `/biblia/${book.slug}/`;
  const title = fit(
    `${book.name} ${chapter.number} en español`,
    ` | ${catalog.translation.name}`,
    MAX_TITLE_LENGTH,
  );
  const description = fit(
    `Texto completo de ${book.name} ${chapter.number} en la traducción ${catalog.translation.name}`,
    ". Lee la Palabra de Dios y escúchala en La Voz de la Verdad.",
    MAX_DESCRIPTION_LENGTH,
  );
  const body = [
    `<p class="meta">Traducción: ${escapeHtml(catalog.translation.name)}</p>`,
    versesMarkup(chapter.verses),
    `<p class="book-link"><a href="${escapeHtml(bookPath)}">Ver el libro completo de ${escapeHtml(book.name)}</a></p>`,
    chaptersMarkup(book, siblings),
    playerMarkup(),
  ].join("\n");

  return {
    path,
    title,
    description,
    ogTitle: `${book.name} ${chapter.number}`,
    jsonLd: jsonLdOf({
      "@type": "WebPage",
      "@id": `${canonicalOf(path)}#page`,
      name: title,
      description,
      url: canonicalOf(path),
      inLanguage: "es-CO",
      isPartOf: [
        { "@id": `${canonicalOf(bookPath)}#page` },
        { "@id": `${SITE_URL}/#website` },
      ],
      about: { "@type": "Book", name: book.name, url: canonicalOf(bookPath) },
    }),
    body,
    lastmod: lastmodOf(catalog),
    priority: 0.6,
    changefreq: "yearly",
  };
}

function bookPage(
  catalog: Catalog,
  book: CatalogBook,
  chapters: readonly CatalogChapter[],
): CatalogPage {
  const path = `/biblia/${book.slug}/`;
  const title = fit(`${book.name} en español`, " | Biblia completa", MAX_TITLE_LENGTH);
  const description = fit(
    `El libro de ${book.name} en español: ${plural(chapters.length, "capítulo", "capítulos")} con el texto de la traducción ${catalog.translation.name}`,
    ". Lee y escucha la Palabra de Dios en La Voz de la Verdad.",
    MAX_DESCRIPTION_LENGTH,
  );
  const body = [
    `<p class="meta">Traducción: ${escapeHtml(catalog.translation.name)}</p>`,
    chaptersMarkup(book, chapters),
    `<p class="index-link"><a href="/biblia/">Ver la Biblia completa</a></p>`,
    playerMarkup(),
  ].join("\n");

  return {
    path,
    title,
    description,
    ogTitle: `${book.name} en español`,
    jsonLd: jsonLdOf({
      "@type": "WebPage",
      "@id": `${canonicalOf(path)}#page`,
      name: title,
      description,
      url: canonicalOf(path),
      inLanguage: "es-CO",
      isPartOf: [{ "@id": `${SITE_URL}/#website` }],
      mainEntity: {
        "@type": "Book",
        name: book.name,
        url: canonicalOf(path),
        hasPart: chapters.map((chapter) => ({
          "@type": "Chapter",
          position: chapter.number,
          name: `${book.name} ${chapter.number}`,
          url: canonicalOf(`/biblia/${book.slug}/${chapter.number}/`),
        })),
      },
    }),
    body,
    lastmod: lastmodOf(catalog),
    priority: 0.8,
    changefreq: "yearly",
  };
}

function testamentMarkup(
  heading: string,
  testament: CatalogBook["testament"],
  books: readonly CatalogBook[],
): string | null {
  const inTestament = books.filter((book) => book.testament === testament);
  if (inTestament.length === 0) return null;
  const items = inTestament
    .map(
      (book) =>
        `<li><a href="/biblia/${escapeHtml(book.slug)}/">${escapeHtml(book.name)}</a></li>`,
    )
    .join("\n");
  return [
    '<section class="testament">',
    `  <h2>${escapeHtml(heading)}</h2>`,
    "  <ul>",
    items,
    "  </ul>",
    "</section>",
  ].join("\n");
}

function bibleIndexPage(catalog: Catalog, chapterCount: number): CatalogPage {
  const path = "/biblia/";
  const books = [...catalog.books].sort((a, b) => a.order - b.order);
  const title = `La Biblia en español | ${plural(books.length, "libro", "libros")} y ${plural(chapterCount, "capítulo", "capítulos")}`;
  const description = fit(
    `La Biblia completa en español: ${plural(books.length, "libro", "libros")} y ${plural(chapterCount, "capítulo", "capítulos")} en la traducción ${catalog.translation.name}`,
    ", para leer y escuchar en vivo.",
    MAX_DESCRIPTION_LENGTH,
  );
  const testaments = [
    testamentMarkup("Antiguo Testamento", "AT", books),
    testamentMarkup("Nuevo Testamento", "NT", books),
  ].filter((section): section is string => section !== null);
  const body = [...testaments, sectionsMarkup(catalog, "biblia"), playerMarkup()].join("\n");

  return {
    path,
    title,
    description,
    ogTitle: "La Biblia en español",
    jsonLd: jsonLdOf({
      "@type": "CollectionPage",
      "@id": `${canonicalOf(path)}#page`,
      name: title,
      description,
      url: canonicalOf(path),
      inLanguage: "es-CO",
      isPartOf: [{ "@id": `${SITE_URL}/#website` }],
      hasPart: books.map((book) => ({
        "@type": "Book",
        name: book.name,
        url: canonicalOf(`/biblia/${book.slug}/`),
      })),
    }),
    body,
    lastmod: lastmodOf(catalog),
    priority: 0.9,
    changefreq: "weekly",
  };
}

function artistPage(catalog: Catalog, artist: CatalogArtist): CatalogPage {
  const path = `/alabanza/${artist.slug}/`;
  const title = fit(artist.name, " | Canciones de alabanza", MAX_TITLE_LENGTH);
  const description = fit(
    `Las canciones de ${artist.name} en el catálogo de La Voz de la Verdad`,
    ": títulos, álbumes y género. Escúchalas en la radio en vivo.",
    MAX_DESCRIPTION_LENGTH,
  );
  const songs = artist.songs
    .map((song) => {
      const parts = [`<span class="song-title">${escapeHtml(song.title)}</span>`];
      if (song.album) {
        parts.push(`<span class="song-album">${escapeHtml(song.album)}</span>`);
      }
      if (song.genre) {
        parts.push(`<span class="song-genre">${escapeHtml(song.genre)}</span>`);
      }
      return `<li class="song">${parts.join(" ")}</li>`;
    })
    .join("\n");
  const body = [
    `<p class="meta">${plural(artist.songCount, "canción", "canciones")}</p>`,
    ['<ul class="songs">', songs, "</ul>"].join("\n"),
    `<p class="index-link"><a href="/alabanza/">Ver todos los artistas</a></p>`,
    playerMarkup(),
  ].join("\n");

  return {
    path,
    title,
    description,
    ogTitle: artist.name,
    jsonLd: jsonLdOf({
      "@type": "WebPage",
      "@id": `${canonicalOf(path)}#page`,
      name: title,
      description,
      url: canonicalOf(path),
      inLanguage: "es-CO",
      isPartOf: [{ "@id": `${SITE_URL}/#website` }],
      about: { "@type": "MusicGroup", name: artist.name, url: canonicalOf(path) },
    }),
    body,
    lastmod: lastmodOf(catalog),
    priority: 0.6,
    changefreq: "weekly",
  };
}

function praiseIndexPage(catalog: Catalog): CatalogPage {
  const path = "/alabanza/";
  const title = "Alabanza y adoración | Canciones cristianas";
  const songCount = catalog.artists.reduce((total, artist) => total + artist.songCount, 0);
  const description = fit(
    `El catálogo de ${plural(songCount, "canción", "canciones")} de alabanza y adoración de La Voz de la Verdad, agrupadas por artista`,
    ". Escúchalas en la radio en vivo.",
    MAX_DESCRIPTION_LENGTH,
  );
  const artists = catalog.artists
    .map(
      (artist) =>
        `<li><a href="/alabanza/${escapeHtml(artist.slug)}/">${escapeHtml(artist.name)}</a> <span class="count">${plural(artist.songCount, "canción", "canciones")}</span></li>`,
    )
    .join("\n");
  const body = [
    ['<ul class="artists">', artists, "</ul>"].join("\n"),
    sectionsMarkup(catalog, "alabanza"),
    playerMarkup(),
  ].join("\n");

  return {
    path,
    title,
    description,
    ogTitle: "Alabanza y adoración",
    jsonLd: jsonLdOf({
      "@type": "CollectionPage",
      "@id": `${canonicalOf(path)}#page`,
      name: title,
      description,
      url: canonicalOf(path),
      inLanguage: "es-CO",
      isPartOf: [{ "@id": `${SITE_URL}/#website` }],
      itemListElement: catalog.artists.map((artist, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: artist.name,
        url: canonicalOf(`/alabanza/${artist.slug}/`),
      })),
    }),
    body,
    lastmod: lastmodOf(catalog),
    priority: 0.8,
    changefreq: "weekly",
  };
}

function videosPage(catalog: Catalog): CatalogPage {
  const path = "/videos/";
  const title = "Videos y predicaciones | La Voz de la Verdad";
  const description = fit(
    `Los videos y las predicaciones de La Voz de la Verdad: ${plural(catalog.videos.length, "video", "videos")} con mensajes bíblicos, alabanza y adoración`,
    ". Verlos en YouTube y escuchar la radio en vivo.",
    MAX_DESCRIPTION_LENGTH,
  );
  const videos = catalog.videos
    .map((video) => {
      return [
        "<li>",
        `  <a href="${escapeHtml(videoUrl(video))}">${escapeHtml(video.title)}</a>`,
        `  <p class="meta">${escapeHtml(video.channelTitle)} · ${escapeHtml(video.publishedAt.slice(0, 10))}</p>`,
        "</li>",
      ].join("\n");
    })
    .join("\n");
  const body = [
    ['<ul class="videos">', videos, "</ul>"].join("\n"),
    sectionsMarkup(catalog, "videos"),
    playerMarkup(),
  ].join("\n");

  return {
    path,
    title,
    description,
    ogTitle: "Videos y predicaciones",
    jsonLd: jsonLdOf({
      "@type": "ItemList",
      "@id": `${canonicalOf(path)}#page`,
      name: title,
      description,
      url: canonicalOf(path),
      inLanguage: "es-CO",
      isPartOf: [{ "@id": `${SITE_URL}/#website` }],
      itemListElement: catalog.videos.map((video, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "VideoObject",
          name: video.title,
          description: video.title,
          uploadDate: video.publishedAt,
          url: videoUrl(video),
          contentUrl: videoUrl(video),
          thumbnailUrl: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
        },
      })),
    }),
    body,
    lastmod: lastmodOf(catalog),
    priority: 0.7,
    changefreq: "weekly",
  };
}

/**
 * Every page of the catalog: one per chapter, one per book, one per artist,
 * the three indexes and the video list.
 */
export function buildCatalogPages(catalog: Catalog): CatalogPage[] {
  const pages: CatalogPage[] = [];
  const booksBySlug = new Map(catalog.books.map((book) => [book.slug, book]));

  // Only the published chapters are linked. A chapter without its book, or
  // without a single verse, would be an empty page with nothing to index, so
  // it is left out of the pages and out of the chapter lists.
  const publishedByBook = new Map<string, CatalogChapter[]>();
  for (const chapter of catalog.chapters) {
    if (!booksBySlug.has(chapter.bookSlug) || chapter.verses.length === 0) continue;
    const chapters = publishedByBook.get(chapter.bookSlug);
    if (chapters) {
      chapters.push(chapter);
    } else {
      publishedByBook.set(chapter.bookSlug, [chapter]);
    }
  }
  for (const chapters of publishedByBook.values()) {
    chapters.sort((a, b) => a.number - b.number);
  }
  const publishedChapterCount = [...publishedByBook.values()].reduce(
    (total, chapters) => total + chapters.length,
    0,
  );

  for (const book of catalog.books) {
    const chapters = publishedByBook.get(book.slug) ?? [];
    for (const chapter of chapters) {
      pages.push(chapterPage(catalog, book, chapter, chapters));
    }
  }

  for (const book of catalog.books) {
    pages.push(bookPage(catalog, book, publishedByBook.get(book.slug) ?? []));
  }

  pages.push(bibleIndexPage(catalog, publishedChapterCount));

  for (const artist of catalog.artists) {
    pages.push(artistPage(catalog, artist));
  }

  pages.push(praiseIndexPage(catalog));

  if (catalog.videos.length > 0) {
    pages.push(videosPage(catalog));
  }

  return pages;
}

/** Indents a block of HTML so the written document is readable. */
function indent(html: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return html
    .split("\n")
    .map((line) => (line.length > 0 ? `${pad}${line}` : line))
    .join("\n");
}

/** The whole document of a generated page. */
export function renderCatalogDocument(page: CatalogPage): string {
  const meta: PageMeta = {
    title: page.title,
    description: page.description,
    ogTitle: page.ogTitle,
    canonical: canonicalOf(page.path),
    jsonLd: page.jsonLd,
  };

  return [
    "<!doctype html>",
    '<html lang="es">',
    "  <head>",
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '    <meta name="theme-color" content="#0A0E1A" />',
    '    <meta name="color-scheme" content="dark" />',
    `    ${buildHeadTagsFor(meta)}`,
    `    ${buildSocialTagsFor(meta)}`,
    `    <script type="application/ld+json">${page.jsonLd}</script>`,
    '    <link rel="stylesheet" href="/catalog.css" />',
    "  </head>",
    "  <body>",
    "    <main>",
    `      <h1>${escapeHtml(page.ogTitle)}</h1>`,
    indent(page.body, 6),
    "    </main>",
    "  </body>",
    "</html>",
    "",
  ].join("\n");
}
