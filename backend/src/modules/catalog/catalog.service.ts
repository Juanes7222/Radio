import fs from "fs";
import path from "path";
import type {
  Catalog,
  CatalogArtist,
  CatalogBook,
  CatalogChapter,
  CatalogSong,
  CatalogVideo,
} from "@radio/types";
import { AZURACAST_REQUEST_TIMEOUT_MS, SONG_REQUESTS_PAGE_SIZE } from "../../shared/constants";
import { slugify } from "../../shared/utils/text";
import { PUBLISHED_TRANSLATION } from "../bible/bibleTranslations";

/** A song of the station library, as the export reads it. */
export interface LibrarySong {
  readonly title: string;
  readonly artist: string | null;
  readonly album: string | null;
  readonly genre: string | null;
}

/**
 * The fields of an AzuraCast request row the export reads.
 *
 * The shared `Song` type declares every field as a string, but the station
 * library answers null for the files that carry no album or no genre. The row
 * itself comes out of a cast, so nothing guarantees that it has a song.
 */
interface LibraryRequestRow {
  readonly request_id?: string;
  readonly song?: {
    readonly title?: string | null;
    readonly artist?: string | null;
    readonly album?: string | null;
    readonly genre?: string | null;
  } | null;
}

/** A page of the library is 100 songs; 100 pages is far beyond the station library. */
const MAX_LIBRARY_PAGES = 100;

/**
 * Groups the songs by artist, dropping the ones with no artist.
 *
 * The artists come back sorted by name and each one carries its songs sorted
 * by title. A song without an album or a genre keeps an empty string, the
 * shape the artifact declares.
 */
export function groupSongsByArtist(
  songs: readonly LibrarySong[]
): { name: string; songs: CatalogSong[] }[] {
  const byArtist = new Map<string, CatalogSong[]>();

  for (const song of songs) {
    const artist = song.artist?.trim();
    if (!artist) continue;

    const grouped = byArtist.get(artist) ?? [];
    grouped.push({
      title: song.title,
      album: song.album ?? "",
      genre: song.genre ?? "",
    });
    byArtist.set(artist, grouped);
  }

  return [...byArtist.entries()]
    .map(([name, grouped]) => ({
      name,
      songs: grouped.sort((a, b) => a.title.localeCompare(b.title, "es")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Maps every name to the slug it publishes under.
 *
 * Two names that fold to the same slug are told apart with a `-2`, a `-3` and
 * so on, in the order the names were given. The suffix grows until the slug
 * is free, so a name that is already spelled like a generated one cannot
 * collide with it. The same name twice keeps the same slug.
 */
export function uniqueSlugs(names: readonly string[]): Map<string, string> {
  const slugs = new Map<string, string>();
  const taken = new Set<string>();

  for (const name of names) {
    if (slugs.has(name)) continue;

    const base = slugify(name);
    let candidate = base;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix++;
    }

    taken.add(candidate);
    slugs.set(name, candidate);
  }

  return slugs;
}

/**
 * Builds the books of the artifact.
 *
 * A book without a published chapter is left out: it would be a page with
 * nothing to read.
 */
export function buildCatalogBooks(
  books: readonly {
    slug: string;
    name: string;
    order: number;
    testament: "AT" | "NT";
    chapterCount: number;
  }[]
): CatalogBook[] {
  return books
    .filter((book) => book.chapterCount > 0)
    .map((book) => ({
      slug: book.slug,
      name: book.name,
      order: book.order,
      testament: book.testament,
      chapterCount: book.chapterCount,
    }));
}

/**
 * Where the artifact lives when the caller does not say otherwise.
 *
 * The path is resolved from the location of this file and not from the
 * working directory: the deploy runs the export with the backend as the
 * working directory, and a relative path resolved from there lands outside
 * the repository, where the web build never looks.
 */
export function defaultCatalogPath(): string {
  return path.resolve(__dirname, "../../../../apps/web/catalog/catalog.json");
}

/**
 * Writes the catalog the web build reads.
 *
 * Everything is read before anything is written, so a failure leaves the
 * previous artifact untouched instead of a half-written one.
 */
export async function exportCatalog(
  targetPath: string
): Promise<{ books: number; chapters: number; artists: number; videos: number }> {
  const [bible, songs, videos] = await Promise.all([
    readBible(),
    readLibrarySongs(),
    readVideos(),
  ]);

  const grouped = groupSongsByArtist(songs);
  const artistSlugs = uniqueSlugs(grouped.map((group) => group.name));
  const artists: CatalogArtist[] = grouped.map((group) => ({
    slug: artistSlugs.get(group.name) ?? slugify(group.name),
    name: group.name,
    songCount: group.songs.length,
    songs: group.songs,
  }));

  const catalog: Catalog = {
    generatedAt: new Date().toISOString(),
    translation: {
      abbreviation: PUBLISHED_TRANSLATION.abbreviation,
      name: PUBLISHED_TRANSLATION.name,
    },
    books: bible.books,
    chapters: bible.chapters,
    artists,
    videos,
  };

  writeCatalog(targetPath, catalog);

  return {
    books: catalog.books.length,
    chapters: catalog.chapters.length,
    artists: catalog.artists.length,
    videos: catalog.videos.length,
  };
}

/** The Bible of the published translation, read from the database. */
async function readBible(): Promise<{ books: CatalogBook[]; chapters: CatalogChapter[] }> {
  const { prisma } = await import("../../infrastructure/database/prisma");

  const translation = await prisma.bibleTranslation.findUnique({
    where: { abbreviation: PUBLISHED_TRANSLATION.abbreviation },
  });
  if (!translation) {
    throw new Error(
      `The published translation ${PUBLISHED_TRANSLATION.abbreviation} is not in the database. ` +
        "Seed it with: pnpm --filter @radio/backend run seed:bible:published"
    );
  }

  const books = await prisma.bibleBook.findMany({
    where: { translationId: translation.id },
    orderBy: { order: "asc" },
    include: {
      chapters: {
        orderBy: { number: "asc" },
        include: { verses: { orderBy: { number: "asc" } } },
      },
    },
  });

  const chapters: CatalogChapter[] = [];
  const catalogBooks: {
    slug: string;
    name: string;
    order: number;
    testament: "AT" | "NT";
    chapterCount: number;
  }[] = [];

  // The book slugs go through the same rule as the artist slugs, so the
  // artifact can never carry two books under the same slug.
  const bookSlugs = uniqueSlugs(books.map((book) => book.name));

  for (const book of books) {
    const published = book.chapters.filter((chapter) => chapter.verses.length > 0);
    // The book and its chapters share one slug, so the web build links a
    // chapter to its book without a lookup.
    const slug = bookSlugs.get(book.name) ?? slugify(book.name);

    for (const chapter of published) {
      chapters.push({
        bookSlug: slug,
        number: chapter.number,
        verses: chapter.verses.map((verse) => ({ number: verse.number, text: verse.text })),
      });
    }

    catalogBooks.push({
      slug,
      name: book.name,
      order: book.order,
      testament: book.testament === "NT" ? "NT" : "AT",
      chapterCount: published.length,
    });
  }

  return { books: buildCatalogBooks(catalogBooks), chapters };
}

/** The songs of the station library, read from AzuraCast. */
async function readLibrarySongs(): Promise<LibrarySong[]> {
  const { azuracastApi, STATION_ID } = await import("../azuracast/azuracast.client");
  const { extractSongRequests } = await import("../azuracast/proxy.service");

  const rows: LibraryRequestRow[] = [];
  let page = 1;

  while (page <= MAX_LIBRARY_PAGES) {
    const { data } = await azuracastApi.get(`/station/${STATION_ID}/requests`, {
      params: { page, per_page: SONG_REQUESTS_PAGE_SIZE },
      timeout: AZURACAST_REQUEST_TIMEOUT_MS,
    });

    const batch: LibraryRequestRow[] = extractSongRequests(data);
    rows.push(...batch);

    if (batch.length < SONG_REQUESTS_PAGE_SIZE) {
      return dedupeByRequest(rows)
        .map(toLibrarySong)
        .filter((song): song is LibrarySong => song !== null);
    }

    page++;
  }

  throw new Error(
    `AzuraCast answered more than ${MAX_LIBRARY_PAGES} pages of songs. ` +
      "The export stopped instead of writing a partial library."
  );
}

/**
 * Keeps one row per request, the way the house client does.
 *
 * A media item reachable through two requestable playlists comes back twice,
 * and the artist page would list it twice.
 */
function dedupeByRequest(rows: readonly LibraryRequestRow[]): LibraryRequestRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.request_id) return true;
    if (seen.has(row.request_id)) return false;
    seen.add(row.request_id);
    return true;
  });
}

/** The videos the station received, read from the database. */
async function readVideos(): Promise<CatalogVideo[]> {
  const { prisma } = await import("../../infrastructure/database/prisma");

  const channels = await prisma.youTubeChannel.findMany({
    select: { channelId: true, title: true },
  });
  const titlesByChannel = new Map(channels.map((channel) => [channel.channelId, channel.title]));

  const videos = await prisma.youTubeVideo.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      videoId: true,
      title: true,
      channelId: true,
      publishedAt: true,
      createdAt: true,
    },
  });

  return videos.map((video) => ({
    videoId: video.videoId,
    title: video.title,
    channelTitle: titlesByChannel.get(video.channelId) ?? "",
    publishedAt: (video.publishedAt ?? video.createdAt).toISOString(),
  }));
}

/**
 * A song of the library, with the empty fields the API answers as null.
 *
 * A row without a song is not a song: it is skipped instead of stopping the
 * export.
 */
function toLibrarySong(row: LibraryRequestRow): LibrarySong | null {
  const song = row.song;
  if (!song) return null;

  return {
    title: readOptionalText(song.title) ?? "",
    artist: readOptionalText(song.artist),
    album: readOptionalText(song.album),
    genre: readOptionalText(song.genre),
  };
}

/** Reads a text field, treating null and blank as the same thing. */
function readOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Writes the artifact, creating the directory it goes into. */
function writeCatalog(targetPath: string, catalog: Catalog): void {
  const absolutePath = path.resolve(targetPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, JSON.stringify(catalog, null, 2), "utf8");
}
